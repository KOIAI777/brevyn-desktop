import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { Connection, Table } from "@lancedb/lancedb";
import type { IndexingTaskRecord, IndexingWorkerResult } from "../indexing";
import type { ModelProviderConfig, RagSearchResult, WorkspaceFileKind } from "../../types/domain";

const SEMESTER_HOME_COURSE_ID = "semester-home";

type RagChunkRow = {
  id: string;
  semester_id: string;
  course_id: string;
  section_id?: string;
  file_id: string;
  file_name: string;
  file_path: string;
  source_path?: string;
  kind: WorkspaceFileKind;
  week_number?: number;
  task_file_bucket?: string;
  chunk_index: number;
  chunk_count: number;
  text: string;
  title: string;
  citation: string;
  vector: number[];
  created_at: string;
  updated_at: string;
};

interface RagIndexServiceOptions {
  dbPath: string;
  resolveEmbeddingProvider: () => ModelProviderConfig | undefined;
  resolveApiKey: (provider: ModelProviderConfig) => string | undefined;
}

const TABLE_NAME = "rag_chunks";
const DEFAULT_TOP_K = 6;
const EMBEDDING_BATCH_SIZE = 24;

export class RagIndexService {
  private connectionPromise: Promise<Connection> | null = null;
  private tablePromise: Promise<Table | null> | null = null;

  constructor(private readonly options: RagIndexServiceOptions) {
    mkdirSync(dirname(options.dbPath), { recursive: true });
  }

  async ingestTask(task: IndexingTaskRecord, result: IndexingWorkerResult): Promise<void> {
    const provider = this.resolveEmbeddingProvider();
    if (!provider) {
      throw new Error("No embedding provider is configured. Save an embedding-enabled provider before indexing files.");
    }
    const apiKey = this.options.resolveApiKey(provider);
    if (!apiKey) {
      throw new Error(`No API key is available for embedding provider ${provider.name}.`);
    }
    if (result.chunks.length === 0) {
      await this.deleteFile(task.payload.fileId);
      return;
    }

    const vectors = await this.embedTexts(result.chunks, provider, apiKey);
    const rows = result.chunks.map((chunk, index) => this.toRow(task, result, index, chunk, vectors[index]));
    const table = await this.ensureWritableTable(rows);
    await table
      .mergeInsert("id")
      .whenMatchedUpdateAll()
      .whenNotMatchedInsertAll()
      .whenNotMatchedBySourceDelete({ where: `file_id = '${escapeSql(task.payload.fileId)}'` })
      .execute(rows);
  }

  async search(query: string, semesterId: string, courseId?: string, maxResults = DEFAULT_TOP_K): Promise<RagSearchResult[]> {
    const table = await this.getReadableTable();
    if (!table) return [];

    const provider = this.resolveEmbeddingProvider();
    if (!provider) return [];
    const apiKey = this.options.resolveApiKey(provider);
    if (!apiKey) return [];

    const normalized = query.trim() || "course materials";
    const [queryVector] = await this.embedTexts([normalized], provider, apiKey);
    const filter = courseId && courseId !== SEMESTER_HOME_COURSE_ID ? `semester_id = '${escapeSql(semesterId)}' AND course_id = '${escapeSql(courseId)}'` : `semester_id = '${escapeSql(semesterId)}'`;

    const rows = await table
      .search(Float32Array.from(queryVector))
      .where(filter)
      .select([
        "id",
        "course_id",
        "file_name",
        "file_path",
        "section_id",
        "chunk_index",
        "chunk_count",
        "text",
        "citation",
        "_distance",
      ])
      .limit(maxResults)
      .toArray();

    return rows.map((row: any) => {
      const distance = Number(row._distance);
      return {
        id: String(row.id),
        courseId: String(row.course_id),
        title: String(row.file_name || row.file_path || "RAG chunk"),
        source: String(row.file_path || row.file_name || "workspace"),
        citation: String(row.citation || row.file_path || "workspace"),
        excerpt: excerptText(String(row.text || ""), normalized),
        score: Number.isFinite(distance) ? 1 / (1 + Math.max(0, distance)) : 0,
      };
    });
  }

  private resolveEmbeddingProvider(): ModelProviderConfig | undefined {
    const provider = this.options.resolveEmbeddingProvider();
    if (!provider || !provider.embeddingModel || !provider.enabled) return undefined;
    if (provider.protocol === "anthropic_messages") return undefined;
    return provider;
  }

  private async embedTexts(texts: string[], provider: ModelProviderConfig, apiKey: string): Promise<number[][]> {
    const filtered = texts.map((text) => text.trim()).filter((text) => text.length > 0);
    if (filtered.length === 0) return [];

    const batches = chunkArray(filtered, EMBEDDING_BATCH_SIZE);
    const vectors: number[][] = [];
    for (const batch of batches) {
      const response = await fetch(`${normalizeBaseUrl(provider.baseUrl || "https://api.openai.com/v1")}/embeddings`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          input: batch,
          model: provider.embeddingModel,
          encoding_format: "float",
        }),
      });
      if (!response.ok) {
        throw new Error(`Embedding request failed (${response.status}): ${await responseText(response)}`);
      }
      const payload = (await response.json()) as { data?: Array<{ embedding?: number[]; index?: number }> };
      const batchVectors = (payload.data || []).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((item) => item.embedding || []);
      vectors.push(...batchVectors);
    }
    return vectors;
  }

  private async ensureWritableTable(rows: RagChunkRow[]): Promise<Table> {
    const conn = await this.connection();
    const table = await conn.createTable(TABLE_NAME, rows, { mode: "create", existOk: true });
    this.tablePromise = Promise.resolve(table);
    return table;
  }

  private async getReadableTable(): Promise<Table | null> {
    if (this.tablePromise) return this.tablePromise;
    this.tablePromise = this.openTable();
    return this.tablePromise;
  }

  private async openTable(): Promise<Table | null> {
    const conn = await this.connection();
    try {
      return await conn.openTable(TABLE_NAME);
    } catch {
      return null;
    }
  }

  private async deleteFile(fileId: string): Promise<void> {
    const table = await this.getReadableTable();
    if (!table) return;
    await table.delete(`file_id = '${escapeSql(fileId)}'`);
  }

  private async connection(): Promise<Connection> {
    if (!this.connectionPromise) {
      this.connectionPromise = import("@lancedb/lancedb").then(({ connect }) => connect(this.options.dbPath));
    }
    return this.connectionPromise;
  }

  private toRow(task: IndexingTaskRecord, result: IndexingWorkerResult, chunkIndex: number, text: string, vector: number[]): RagChunkRow {
    const citationParts = [result.sourcePath || task.payload.path, `chunk ${chunkIndex + 1}/${result.chunks.length}`];
    return {
      id: `${task.payload.fileId}:${chunkIndex}`,
      semester_id: task.semesterId || task.payload.semesterId || "",
      course_id: task.courseId || task.payload.courseId,
      section_id: task.sectionId || task.payload.sectionId,
      file_id: task.payload.fileId,
      file_name: task.payload.name,
      file_path: task.payload.path,
      source_path: task.payload.sourcePath,
      kind: task.payload.kind,
      week_number: task.payload.weekNumber,
      task_file_bucket: task.payload.taskFileBucket,
      chunk_index: chunkIndex,
      chunk_count: result.chunks.length,
      text,
      title: task.payload.name,
      citation: citationParts.filter(Boolean).join(" · "),
      vector,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (size <= 0) return [values];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function excerptText(text: string, query: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lower = normalized.toLowerCase();
  const matchIndex = terms.map((term) => lower.indexOf(term)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (matchIndex === undefined) return normalized.slice(0, 260);
  const start = Math.max(0, matchIndex - 90);
  const end = Math.min(normalized.length, matchIndex + 180);
  return normalized.slice(start, end).trim();
}

async function responseText(response: Response): Promise<string> {
  try {
    return (await response.text()).replace(/\s+/g, " ").slice(0, 240);
  } catch {
    return "";
  }
}

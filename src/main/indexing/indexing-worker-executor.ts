import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { IndexingTaskRecord, IndexingWorkerResult } from "./indexing-types";

export interface IndexingExecutor {
  run(task: IndexingTaskRecord): Promise<IndexingWorkerResult>;
}

type WorkerMessage =
  | { ok: true; result: IndexingWorkerResult }
  | { ok: false; error: string };

export class WorkerThreadIndexingExecutor implements IndexingExecutor {
  constructor(
    private readonly workerPath = join(__dirname, "indexing-worker.cjs"),
    private readonly timeoutMs = 120_000,
  ) {}

  run(task: IndexingTaskRecord): Promise<IndexingWorkerResult> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(this.workerPath, { workerData: task });
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        void worker.terminate();
        reject(new Error(`Indexing worker timed out for ${task.payload.name}.`));
      }, this.timeoutMs);

      worker.once("message", (message: WorkerMessage) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (message.ok) resolve(message.result);
        else reject(new Error(message.error));
      });

      worker.once("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });

      worker.once("exit", (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (code === 0) {
          reject(new Error(`Indexing worker exited without a result for ${task.payload.name}.`));
        } else {
          reject(new Error(`Indexing worker exited with code ${code} for ${task.payload.name}.`));
        }
      });
    });
  }
}

import { randomUUID } from "node:crypto";
import type { LocalStore } from "../services/local-store";
import type { IndexingExecutor } from "./indexing-worker-executor";
import type { IndexingTaskRecord } from "./indexing-types";

export interface IndexingQueueOptions {
  concurrency?: number;
  pollMs?: number;
  lockMs?: number;
}

export class IndexingQueueService {
  private readonly workerId = `uclaw-indexer-${randomUUID()}`;
  private readonly concurrency: number;
  private readonly pollMs: number;
  private readonly lockMs: number;
  private readonly active = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private draining = false;
  private stopped = true;

  constructor(
    private readonly store: LocalStore,
    private readonly executor: IndexingExecutor,
    options: IndexingQueueOptions = {},
  ) {
    this.concurrency = options.concurrency ?? 2;
    this.pollMs = options.pollMs ?? 1_500;
    this.lockMs = options.lockMs ?? 90_000;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.store.recoverExpiredIndexingTasks();
    this.poke();
    this.timer = setInterval(() => this.poke(), this.pollMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  poke(): void {
    if (this.stopped) return;
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (!this.stopped && this.active.size < this.concurrency) {
        const task = this.store.claimNextIndexingTask(this.workerId, this.lockMs);
        if (!task) break;
        this.active.add(task.id);
        void this.runTask(task).finally(() => {
          this.active.delete(task.id);
          this.poke();
        });
      }
    } finally {
      this.draining = false;
    }
  }

  private async runTask(task: IndexingTaskRecord): Promise<void> {
    try {
      const result = await this.executor.run(task);
      this.store.completeIndexingTask(task.id, result);
    } catch (error) {
      this.store.failIndexingTask(task.id, error instanceof Error ? error.message : String(error));
    }
  }
}

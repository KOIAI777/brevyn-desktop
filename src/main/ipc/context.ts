import type { IndexingQueueService } from "../indexing";
import type { LocalStore } from "../services/local-store";

export interface IpcContext {
  store: LocalStore;
  indexingQueue?: IndexingQueueService;
}

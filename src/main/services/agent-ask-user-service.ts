import type { AskUserRequest } from "../../types/domain";

interface PendingAskUser {
  request: AskUserRequest;
  resolve: (response: string) => void;
}

export interface AskUserResolution {
  request: AskUserRequest;
  response: string;
}

export class AgentAskUserService {
  private readonly pending = new Map<string, PendingAskUser>();

  waitForResponse(request: AskUserRequest, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) return Promise.resolve("");

    return new Promise((resolve) => {
      this.pending.set(request.id, { request, resolve });
      signal?.addEventListener(
        "abort",
        () => {
          this.resolve(request.id, "");
        },
        { once: true },
      );
    });
  }

  respond(requestId: string, response: string): AskUserResolution | null {
    return this.resolve(requestId, response);
  }

  getPendingRequests(): AskUserRequest[] {
    return [...this.pending.values()].map((entry) => entry.request);
  }

  clearRun(runId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.request.runId === runId) {
        entry.resolve("");
        this.pending.delete(requestId);
      }
    }
  }

  clearThread(threadId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.request.threadId === threadId) {
        entry.resolve("");
        this.pending.delete(requestId);
      }
    }
  }

  private resolve(requestId: string, response: string): AskUserResolution | null {
    const pending = this.pending.get(requestId);
    if (!pending) return null;
    this.pending.delete(requestId);
    pending.resolve(response);
    return { request: pending.request, response };
  }
}

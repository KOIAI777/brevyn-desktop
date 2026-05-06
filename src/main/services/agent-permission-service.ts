import type { ApprovalRequest } from "../../types/domain";

export type ApprovalDecision = "allow" | "deny";

interface PendingApproval {
  request: ApprovalRequest;
  resolve: (decision: ApprovalDecision) => void;
}

export interface ApprovalResolution {
  request: ApprovalRequest;
  decision: ApprovalDecision;
}

export class AgentPermissionService {
  private readonly pending = new Map<string, PendingApproval>();

  waitForApproval(request: ApprovalRequest, signal?: AbortSignal): Promise<ApprovalDecision> {
    if (signal?.aborted) return Promise.resolve("deny");

    return new Promise((resolve) => {
      this.pending.set(request.id, { request, resolve });
      signal?.addEventListener(
        "abort",
        () => {
          this.resolve(request.id, "deny");
        },
        { once: true },
      );
    });
  }

  approve(requestId: string): ApprovalResolution | null {
    return this.resolve(requestId, "allow");
  }

  reject(requestId: string): ApprovalResolution | null {
    return this.resolve(requestId, "deny");
  }

  getPendingRequests(): ApprovalRequest[] {
    return [...this.pending.values()].map((entry) => entry.request);
  }

  clearRun(runId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.request.runId === runId) {
        entry.resolve("deny");
        this.pending.delete(requestId);
      }
    }
  }

  clearThread(threadId: string): void {
    for (const [requestId, entry] of this.pending) {
      if (entry.request.threadId === threadId) {
        entry.resolve("deny");
        this.pending.delete(requestId);
      }
    }
  }

  private resolve(requestId: string, decision: ApprovalDecision): ApprovalResolution | null {
    const pending = this.pending.get(requestId);
    if (!pending) return null;
    this.pending.delete(requestId);
    pending.resolve(decision);
    return { request: pending.request, decision };
  }
}

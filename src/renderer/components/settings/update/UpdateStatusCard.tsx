import { RefreshCw } from "lucide-react";
import type { GitHubRelease, UpdaterStatus } from "@/types/domain";
import { cx } from "@/lib/cn";

export function UpdateStatusCard({
  status,
  checking,
  onCheck,
}: {
  status: UpdaterStatus | null;
  checking: boolean;
  release: GitHubRelease | null;
  onCheck: () => void;
  onDismissDownloaded: () => void;
  onQuitAndInstall: () => void;
}) {
  const currentVersion = status?.currentVersion || "0.1.0";
  const isChecking = checking || status?.status === "checking";
  const canCheck = status?.status !== "downloading" && status?.status !== "downloaded";

  return (
    <section className="settings-solid-card rounded-[var(--radius-panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">手动检查更新</h3>
          <p className="mt-1 text-xs text-muted-foreground">当前版本 {currentVersion}</p>
        </div>
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-border/65 bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
          onClick={onCheck}
          disabled={!canCheck || isChecking}
        >
          <RefreshCw className={cx("h-3.5 w-3.5", isChecking && "animate-spin")} />
          检查更新
        </button>
      </div>
    </section>
  );
}

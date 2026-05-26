import { Download, RefreshCw } from "lucide-react";
import type { GitHubRelease, UpdaterStatus } from "@/types/domain";
import { cx } from "@/lib/cn";
import brevynAppIconUrl from "@/assets/brevyn-app-icon.png";
import { formatBytes, releaseUrlForTag } from "./releaseFormat";
import { ReleaseMarkdown } from "./ReleaseNotesViewer";

export function UpdateStatusCard({
  status,
  checking,
  release,
  onCheck,
  onDismissDownloaded,
  onQuitAndInstall,
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
  const canCheck = status?.status !== "unsupported" && status?.status !== "downloading" && status?.status !== "downloaded";
  const progress = status?.status === "downloading" ? status.progress : null;
  const activeReleaseNotes = release?.body || (status?.status === "available" ? status.releaseNotes : "");
  const activeReleaseUrl = release?.htmlUrl || releaseUrlForTag(status?.status === "available" ? status.version : currentVersion);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border bg-background/70 p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <img src={brevynAppIconUrl} alt="" className="h-8 w-8 rounded-lg" />
              Brevyn
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              本地优先的课程工作区，支持文件、Skill 和 Agent 会话。
            </p>
            <div className="mt-3 inline-flex rounded-full border bg-card px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
              版本 {currentVersion}
            </div>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-card px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onCheck}
            disabled={!canCheck || isChecking}
          >
            <RefreshCw className={cx("h-3.5 w-3.5", isChecking && "animate-spin")} />
            检查更新
          </button>
        </div>
      </section>

      <section className="rounded-xl border bg-background/70 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">自动更新</h3>
            <p className="mt-1 text-xs text-muted-foreground">{updateStatusText(status)}</p>
          </div>
          {status?.status === "downloaded" ? (
            <div className="flex shrink-0 items-center gap-2">
              {!status.dismissed ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={onDismissDownloaded}
                >
                  稍后
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs font-semibold text-background transition hover:opacity-90"
                onClick={onQuitAndInstall}
              >
                <Download className="h-3.5 w-3.5" />
                重启安装
              </button>
            </div>
          ) : null}
        </div>

        {progress ? (
          <div className="mt-4 space-y-2">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground transition-all duration-300" style={{ width: `${Math.max(0, Math.min(100, progress.percent))}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>{progress.percent.toFixed(1)}%</span>
              <span>{formatBytes(progress.transferred)} / {formatBytes(progress.total)} · {formatBytes(progress.bytesPerSecond)}/s</span>
            </div>
          </div>
        ) : null}

        {status?.status === "available" && activeReleaseNotes ? (
          <div className="mt-4 rounded-xl border bg-card p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-foreground">更新日志</span>
              <button
                type="button"
                className="text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                onClick={() => void window.brevyn.app.openExternal(activeReleaseUrl)}
              >
                Release
              </button>
            </div>
            <ReleaseMarkdown body={activeReleaseNotes} maxHeightClassName="max-h-52" />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function updateStatusText(status: UpdaterStatus | null): string {
  if (!status) return "正在读取更新状态...";
  switch (status.status) {
    case "unsupported":
      return status.reason;
    case "checking":
      return "正在检查是否有新版本...";
    case "available":
      return `发现新版本 ${status.version}，正在后台下载。`;
    case "downloading":
      return `正在下载 ${status.version}。`;
    case "downloaded":
      return status.dismissed ? `${status.version} 已下载完成，已暂不提醒；可随时重启安装。` : `${status.version} 已下载完成，重启后生效。`;
    case "not-available":
      return "当前已经是最新版本。";
    case "error":
      return status.error;
    default:
      return "未检查更新。";
  }
}

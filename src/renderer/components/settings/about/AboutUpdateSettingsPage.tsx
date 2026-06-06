import { useEffect, useState } from "react";
import { UpdateStatusCard } from "@/components/settings/update/UpdateStatusCard";
import { VersionHistory } from "@/components/settings/update/VersionHistory";
import { errorMessage } from "@/components/settings/shared/settingsErrors";
import type { UpdaterStatus } from "../../../../types/domain";

export function AboutUpdateSettingsPage() {
  const [status, setStatus] = useState<UpdaterStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<Awaited<ReturnType<typeof window.brevyn.updater.getReleaseByTag>>>(null);

  useEffect(() => {
    let cancelled = false;
    void window.brevyn.updater
      .getStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((error) => {
        if (!cancelled) {
          setStatus({
            status: "error",
            currentVersion: "0.0.0",
            supported: false,
            error: errorMessage(error, "加载更新状态失败。"),
          });
        }
      });
    const unsubscribe = window.brevyn.updater.onStatusChanged((next) => {
      setStatus(next);
      if (next.status !== "checking") setChecking(false);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (status?.status !== "available" || !status.version) {
      setReleaseNotes(null);
      return;
    }
    let cancelled = false;
    void window.brevyn.updater
      .getReleaseByTag(status.version)
      .then((release) => {
        if (!cancelled) setReleaseNotes(release);
      })
      .catch(() => {
        if (!cancelled) setReleaseNotes(null);
      });
    return () => {
      cancelled = true;
    };
  }, [status]);

  async function checkForUpdates() {
    setChecking(true);
    try {
      await window.brevyn.updater.checkForUpdates();
    } catch (error) {
      setStatus({
        status: "error",
        currentVersion: status?.currentVersion || "0.0.0",
        supported: Boolean(status?.supported),
        error: errorMessage(error, "检查更新失败。"),
      });
      setChecking(false);
    }
  }

  async function quitAndInstall() {
    await window.brevyn.updater.quitAndInstall();
  }

  async function dismissDownloadedUpdate() {
    const next = await window.brevyn.updater.dismissDownloaded();
    setStatus(next);
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <UpdateStatusCard
        status={status}
        checking={checking}
        release={releaseNotes}
        onCheck={() => void checkForUpdates()}
        onDismissDownloaded={() => void dismissDownloadedUpdate()}
        onQuitAndInstall={() => void quitAndInstall()}
      />
      <VersionHistory />
    </div>
  );
}

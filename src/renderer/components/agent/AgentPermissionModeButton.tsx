import { Map, ShieldAlert, ShieldCheck } from "lucide-react";
import type { AgentPermissionMode } from "@/types/domain";

const MODE_ORDER: AgentPermissionMode[] = ["auto", "bypassPermissions", "plan"];

const MODE_COPY: Record<AgentPermissionMode, { label: string; description: string; next: string; tone: string; icon: typeof ShieldCheck }> = {
  auto: {
    label: "自动审批",
    description: "由 SDK 判断工具风险，必要时再请求确认。",
    next: "完全自动",
    tone: "text-muted-foreground",
    icon: ShieldCheck,
  },
  bypassPermissions: {
    label: "完全自动",
    description: "跳过权限检查，适合受信任工作区。",
    next: "计划模式",
    tone: "text-amber-600",
    icon: ShieldAlert,
  },
  plan: {
    label: "计划模式",
    description: "只计划，不执行写入和命令。",
    next: "自动审批",
    tone: "text-slate-600",
    icon: Map,
  },
};

export function AgentPermissionModeButton({
  running,
  permissionMode,
  onSetPermissionMode,
}: {
  running: boolean;
  permissionMode: AgentPermissionMode;
  onSetPermissionMode: (mode: AgentPermissionMode) => void;
}) {
  const copy = MODE_COPY[permissionMode];
  const Icon = copy.icon;

  function cycleMode() {
    const index = MODE_ORDER.indexOf(permissionMode);
    onSetPermissionMode(MODE_ORDER[(index + 1) % MODE_ORDER.length] || "auto");
  }

  return (
    <div className="group/permission relative shrink-0">
      <button
        type="button"
        disabled={running}
        onClick={cycleMode}
        className={`inline-flex h-7 w-8 items-center justify-center rounded-full transition hover:bg-accent/70 disabled:cursor-not-allowed disabled:opacity-45 ${copy.tone}`}
        aria-label={copy.label}
      >
        <Icon className="h-4 w-4" strokeWidth={2.1} />
      </button>
      <div className="pointer-events-none absolute bottom-full right-0 z-[80] mb-2 w-56 translate-y-1 rounded-xl border border-white/60 bg-card/98 px-3 py-2 text-[11px] text-muted-foreground opacity-0 shadow-[0_12px_30px_rgba(64,55,38,0.14)] ring-1 ring-border/50 transition duration-150 group-hover/permission:translate-y-0 group-hover/permission:opacity-100 group-focus-within/permission:translate-y-0 group-focus-within/permission:opacity-100">
        <p className="font-semibold text-foreground">{copy.label}</p>
        <p className="mt-0.5">{copy.description}</p>
        {!running && <p className="mt-1 text-[10px] text-muted-foreground/80">点击切换到 {copy.next}</p>}
      </div>
    </div>
  );
}

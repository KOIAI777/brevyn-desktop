import type { RunStatus } from "@/types/domain";

export function isRunning(status: RunStatus): boolean {
  return ["queued", "starting", "running", "waiting_tool", "waiting_approval", "cancelling"].includes(status);
}

export function timelineStatusText(status: RunStatus): string {
  if (status === "queued") return "排队中";
  if (status === "starting") return "启动中";
  if (status === "running" || status === "waiting_tool") return "正在思考";
  if (status === "waiting_approval") return "等待确认";
  if (status === "cancelling") return "停止中";
  if (status === "completed") return "已完成";
  if (status === "failed") return "失败";
  if (status === "cancelled") return "已停止";
  return "空闲";
}

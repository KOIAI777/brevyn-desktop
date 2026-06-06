import { formatCloudPoints } from "@/components/settings/account/cloudPlanUtils";
import type { CloudGatewayGroup, CloudRedeemCodeResult } from "../../../../types/domain";

export function redeemKindLabel(kind: string): string {
  if (kind === "subscription") return "套餐";
  if (kind === "balance") return "积分";
  return kind || "兑换";
}

export function redeemStatusLabel(status: string): string {
  if (status === "ok" || status === "synced") return "已兑换";
  if (status === "gateway_failed") return "待同步";
  if (status === "pending_gateway") return "同步中";
  if (status === "failed") return "失败";
  return status || "已兑换";
}

export function redeemValueLabel(result: CloudRedeemCodeResult): string {
  const redemption = result.result.redemption;
  if (redemption.kind === "subscription") return `${redemption.validityDays || 0} 天`;
  return formatCloudPoints(redemption.value);
}

export function redeemedPlanLabel(result: CloudRedeemCodeResult, groups: CloudGatewayGroup[]): string {
  const externalGroupId = result.result.redemption.externalGroupId;
  if (!externalGroupId) return "默认套餐";
  return groups.find((group) => group.externalGroupId === externalGroupId)?.name || "已兑换套餐";
}

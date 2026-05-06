import type { WorkspaceFileNode } from "@/types/domain";

export function firstPreviewableFile(nodes: WorkspaceFileNode[]): WorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.kind !== "folder") return node;
    const child = node.children ? firstPreviewableFile(node.children) : null;
    if (child) return child;
  }
  return null;
}

export function findFileNode(nodes: WorkspaceFileNode[], id: string): WorkspaceFileNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = node.children ? findFileNode(node.children, id) : null;
    if (child) return child;
  }
  return null;
}

export function formatRelative(value: string): string {
  const delta = Math.max(0, Date.now() - Date.parse(value || ""));
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

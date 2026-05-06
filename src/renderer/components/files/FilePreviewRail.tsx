import type { FilePreview } from "@/types/domain";
import { FilePreviewPane } from "./FilePreviewPane";

export function FilePreviewRail({
  collapsed,
  preview,
}: {
  collapsed: boolean;
  preview: FilePreview | null;
}) {
  if (collapsed) return null;

  return (
    <aside className="hidden w-[440px] shrink-0 flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 transition-[width,opacity,transform] duration-200 xl:flex">
      <FilePreviewPane preview={preview} />
    </aside>
  );
}

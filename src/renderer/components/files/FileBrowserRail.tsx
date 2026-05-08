import { FolderOpen, Loader2, Upload } from "lucide-react";
import type { Course, FileStats, WorkspaceFileNode } from "@/types/domain";
import { FileTreeNode } from "./FileTreeNode";

export function FileBrowserRail({
  collapsed,
  course,
  stats,
  files,
  loading,
  selectedFileId,
  onSelectFile,
  onOpenUpload,
}: {
  collapsed: boolean;
  course?: Course;
  stats?: FileStats | null;
  files: WorkspaceFileNode[];
  loading?: boolean;
  selectedFileId: string;
  onSelectFile: (file: WorkspaceFileNode) => void;
  onOpenUpload: () => void;
}) {
  if (collapsed) return null;
  const uploadDisabled = !course || Boolean(course.archivedAt);
  const uploadTitle = !course ? "Select a course before uploading files" : course.archivedAt ? "Restore this course before uploading files" : "Import course files";

  return (
    <aside className="hidden w-[320px] shrink-0 flex-col overflow-hidden rounded-lg border bg-card/85 shadow-sm ring-1 ring-border/60 transition-[width,opacity,transform] duration-200 lg:flex">
      <div className="flex items-center justify-between border-b px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <FolderOpen className="h-3.5 w-3.5" />
            Course Files
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {course?.name || "Workspace"} · {stats?.totalFiles ?? files.reduce((count, node) => count + countLeafFiles(node), 0)} files
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {stats && (
            <span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">
              {stats.sectionCount} sections
            </span>
          )}
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1 rounded-md border bg-background/70 px-2 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
            disabled={uploadDisabled}
            onClick={onOpenUpload}
            title={uploadTitle}
          >
            <Upload className="h-3 w-3" />
            Upload
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 uclaw-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading course files...
          </div>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-background/60 px-3 py-5 text-center text-xs text-muted-foreground">No course files yet.</div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => (
              <FileTreeNode key={file.id} node={file} level={0} selectedFileId={selectedFileId} onSelect={onSelectFile} />
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function countLeafFiles(node: WorkspaceFileNode): number {
  if (node.kind !== "folder") return 1;
  return (node.children || []).reduce((count, child) => count + countLeafFiles(child), 0);
}

import { BookOpen, FileCode, FileImage, FileText, FolderOpen, Library, type LucideIcon } from "lucide-react";
import type { WorkspaceFileKind } from "@/types/domain";

export function fileIcon(kind: WorkspaceFileKind): LucideIcon {
  if (kind === "folder") return FolderOpen;
  if (kind === "image") return FileImage;
  if (kind === "code") return FileCode;
  if (kind === "pdf") return FileText;
  if (kind === "pptx") return Library;
  if (kind === "docx") return FileText;
  if (kind === "markdown") return BookOpen;
  return FileText;
}

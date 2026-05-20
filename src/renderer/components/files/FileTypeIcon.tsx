import { memo } from "react";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";

interface FileTypeIconProps {
  name: string;
  isDirectory?: boolean;
  size?: number;
  className?: string;
}

export const FileTypeIcon = memo(function FileTypeIcon({
  name,
  isDirectory = false,
  size = 16,
  className,
}: FileTypeIconProps) {
  return (
    <span
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        lineHeight: 0,
        verticalAlign: "middle",
      }}
    >
      {isDirectory ? (
        <FolderIcon folderName={name} width={size} height={size} />
      ) : (
        <FileIcon fileName={name} autoAssign width={size} height={size} />
      )}
    </span>
  );
});

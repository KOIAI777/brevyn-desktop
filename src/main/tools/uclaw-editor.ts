import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { applyDiff, type ApplyPatchOperation, type ApplyPatchResult, type Editor, type EditorInvocationContext } from "@openai/agents";

export interface UclawEditorOptions {
  cwd: string;
}

export class UclawEditor implements Editor {
  constructor(private readonly options: UclawEditorOptions) {}

  async createFile(
    operation: Extract<ApplyPatchOperation, { type: "create_file" }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult> {
    const target = this.resolveWorkspacePath(operation.path);
    if (existsSync(target)) {
      return { status: "failed", output: `File already exists: ${operation.path}` };
    }
    const content = applyDiff("", operation.diff, "create");
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content, "utf8");
    return { status: "completed", output: `Created ${operation.path}` };
  }

  async updateFile(
    operation: Extract<ApplyPatchOperation, { type: "update_file" }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult> {
    const target = this.resolveWorkspacePath(operation.path);
    if (!existsSync(target)) {
      return { status: "failed", output: `File not found: ${operation.path}` };
    }

    const original = readFileSync(target, "utf8");
    const updated = applyDiff(original, operation.diff, "default");

    if (operation.moveTo) {
      const next = this.resolveWorkspacePath(operation.moveTo);
      mkdirSync(dirname(next), { recursive: true });
      writeFileSync(target, updated, "utf8");
      renameSync(target, next);
      return { status: "completed", output: `Updated ${operation.path} and moved to ${operation.moveTo}` };
    }

    writeFileSync(target, updated, "utf8");
    return { status: "completed", output: `Updated ${operation.path}` };
  }

  async deleteFile(
    operation: Extract<ApplyPatchOperation, { type: "delete_file" }>,
    _context?: EditorInvocationContext,
  ): Promise<ApplyPatchResult> {
    const target = this.resolveWorkspacePath(operation.path);
    if (!existsSync(target)) {
      return { status: "failed", output: `File not found: ${operation.path}` };
    }
    unlinkSync(target);
    return { status: "completed", output: `Deleted ${operation.path}` };
  }

  resolveWorkspacePath(inputPath: string): string {
    const target = isAbsolute(inputPath) ? resolve(inputPath) : resolve(this.options.cwd, inputPath);
    const rel = relative(this.options.cwd, target);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`Path escapes UCLAW workspace: ${inputPath}`);
    }
    return target;
  }
}

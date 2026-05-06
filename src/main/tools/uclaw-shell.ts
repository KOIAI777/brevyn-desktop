import { spawn } from "node:child_process";
import type { Shell, ShellAction, ShellResult } from "@openai/agents";

export type ShellRisk = "allow" | "review" | "deny";

export interface ShellCommandPolicy {
  risk: ShellRisk;
  reason: string;
}

export interface UclawShellOptions {
  cwd: string;
  defaultTimeoutMs?: number;
  defaultMaxOutputLength?: number;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_OUTPUT_LENGTH = 24_000;

const READ_ONLY_PATTERNS = [
  /^pwd(?:\s|$)/,
  /^ls(?:\s|$)/,
  /^find(?:\s|$)/,
  /^rg(?:\s|$)/,
  /^grep(?:\s|$)/,
  /^cat(?:\s|$)/,
  /^head(?:\s|$)/,
  /^tail(?:\s|$)/,
  /^wc(?:\s|$)/,
  /^sort(?:\s|$)/,
  /^uniq(?:\s|$)/,
  /^awk(?:\s|$)/,
  /^sed(?![\s\S]*\s-i(?:\s|$))(?:\s|$)/,
  /^git\s+(?:status|diff|log|show|branch|rev-parse|ls-files)(?:\s|$)/,
  /^npm\s+(?:run\s+(?:typecheck|build|test|lint)|list|view)(?:\s|$)/,
];

const REVIEW_PATTERNS = [
  /\b(?:rm|rmdir|mv|cp|mkdir|touch|truncate)\b/,
  /\b(?:chmod|chown|chflags|xattr)\b/,
  /\b(?:tee|dd)\b/,
  /\b(?:sed|perl)\s+[^|&;]*\s-i(?:\s|$)/,
  /(?:^|[^&])(?:\d*)>{1,2}(?!&)/,
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|update|upgrade|exec|dlx)\b/,
  /\bgit\s+(?:add|commit|push|pull|fetch|reset|clean|rebase|merge|checkout|switch|restore|tag)\b/,
  /\b(?:curl|wget)\b/,
  /\b(?:node|python|python3|ruby|perl|php)\s+(?:-e|-c)\b/,
];

const DENY_PATTERNS = [
  /\bsudo\b/,
  /\bsu\s+-?\b/,
  /\brm\s+[^|&;]*-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+\//,
  /\b(?:mkfs|diskutil|launchctl|shutdown|reboot|halt)\b/,
  /:\s*\(\s*\)\s*\{.*:\s*\|/,
  /\b(?:ssh|scp|rsync)\b/,
];

export class UclawShell implements Shell {
  constructor(private readonly options: UclawShellOptions) {}

  classifyAction(action: ShellAction): ShellCommandPolicy {
    return action.commands.reduce<ShellCommandPolicy>(
      (policy, command) => maxPolicy(policy, classifyShellCommand(command)),
      { risk: "allow", reason: "All commands are read-only." },
    );
  }

  async run(action: ShellAction): Promise<ShellResult> {
    const maxOutputLength = action.maxOutputLength ?? this.options.defaultMaxOutputLength ?? DEFAULT_MAX_OUTPUT_LENGTH;
    const timeoutMs = action.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    const output: ShellResult["output"] = [];

    for (const command of action.commands) {
      const policy = classifyShellCommand(command);
      if (policy.risk === "deny") {
        output.push({
          stdout: "",
          stderr: `Blocked by UCLAW shell policy: ${policy.reason}\nCommand: ${command}`,
          outcome: { type: "exit", exitCode: 126 },
        });
        continue;
      }

      output.push(await runCommand(command, this.options.cwd, timeoutMs, maxOutputLength));
    }

    return {
      output,
      maxOutputLength,
      providerData: {
        cwd: this.options.cwd,
        policy: this.classifyAction(action),
      },
    };
  }
}

export function classifyShellCommand(command: string): ShellCommandPolicy {
  const normalized = command.trim();
  if (!normalized) return { risk: "deny", reason: "Empty command." };
  if (DENY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { risk: "deny", reason: "Command matches a blocked system or destructive pattern." };
  }
  if (REVIEW_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { risk: "review", reason: "Command may write files, change Git state, install packages, or access the network." };
  }
  if (READ_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { risk: "allow", reason: "Command matches the read-only allowlist." };
  }
  return { risk: "review", reason: "Command is not in the read-only allowlist." };
}

function maxPolicy(a: ShellCommandPolicy, b: ShellCommandPolicy): ShellCommandPolicy {
  const rank: Record<ShellRisk, number> = { allow: 0, review: 1, deny: 2 };
  return rank[b.risk] > rank[a.risk] ? b : a;
}

async function runCommand(command: string, cwd: string, timeoutMs: number, maxOutputLength: number): Promise<ShellResult["output"][number]> {
  return new Promise((resolve) => {
    const child = spawn("/bin/zsh", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const truncate = (value: string) =>
      value.length > maxOutputLength ? `${value.slice(0, maxOutputLength)}\n[truncated at ${maxOutputLength} chars]` : value;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = truncate(stdout + chunk.toString("utf8"));
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = truncate(stderr + chunk.toString("utf8"));
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr: `${stderr}${stderr ? "\n" : ""}${error.message}`,
        outcome: { type: "exit", exitCode: 1 },
      });
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        stdout,
        stderr,
        outcome: timedOut ? { type: "timeout" } : { type: "exit", exitCode: code },
      });
    });
  });
}

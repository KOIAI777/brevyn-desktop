import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join } from "node:path";

export function runtimeRequire() {
  const candidates = [
    process.env.BREVYN_RUNTIME_REQUIRE_FROM,
    join(process.cwd(), "package.json"),
  ].filter(Boolean);
  const requireFrom = candidates.find((candidate) => existsSync(candidate));
  if (!requireFrom) throw new Error("Cannot locate Brevyn runtime dependencies.");
  return createRequire(requireFrom);
}

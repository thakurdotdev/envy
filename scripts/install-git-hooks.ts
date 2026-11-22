// Points git at the hooks in .githooks/, so every clone gets the same
// pre-commit checks after `bun install`. Skipped when there is no .git folder
// (for example inside a published tarball or a CI cache).
import { existsSync } from "node:fs";

if (!existsSync(".git")) {
  process.exit(0);
}

const result = Bun.spawnSync(["git", "config", "core.hooksPath", ".githooks"]);
if (result.exitCode !== 0) {
  console.error("Could not set up the git hooks. Run: git config core.hooksPath .githooks");
  process.exit(1);
}

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function runGit(args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function main() {
  try {
    const gitRoot = runGit(["rev-parse", "--show-toplevel"]);
    if (path.resolve(gitRoot) !== repoRoot) {
      console.warn("Skipping git hook install: package is not running from the repo root.");
      return;
    }

    runGit(["config", "core.hooksPath", ".githooks"]);
    console.log("Configured git hooks: core.hooksPath=.githooks");
  } catch (error) {
    console.warn("Skipping git hook install.");
    if (error instanceof Error && error.message) {
      console.warn(error.message);
    }
  }
}

main();

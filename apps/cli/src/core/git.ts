/** The checked-out git branch, or undefined outside a repo or on a detached HEAD. */
export function getCurrentGitBranch(folder: string): string | undefined {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: folder,
      stdout: "pipe",
      stderr: "ignore",
    });
    const branch = result.stdout.toString().trim();
    return result.exitCode === 0 && branch !== "" && branch !== "HEAD" ? branch : undefined;
  } catch {
    // git is not installed.
    return undefined;
  }
}

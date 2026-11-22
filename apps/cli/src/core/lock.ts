import { mkdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir } from "./paths.ts";

const STALE_AFTER_MS = 30_000;
const WAIT_STEP_MS = 50;
const GIVE_UP_AFTER_MS = 20_000;

/**
 * Runs `work` while holding a lock that other envy processes on this machine
 * respect. Used around token refresh: the API ends the session if two
 * processes refresh with the same token, so only one may do it at a time.
 * Creating a folder is atomic, which makes it a simple cross-platform lock.
 */
export async function withLock<Result>(name: string, work: () => Promise<Result>): Promise<Result> {
  const lockPath = join(getConfigDir(), `${name}.lock`);
  await mkdir(getConfigDir(), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();

  for (;;) {
    try {
      await mkdir(lockPath);
      break;
    } catch {
      await removeIfStale(lockPath);
      if (Date.now() - startedAt > GIVE_UP_AFTER_MS) {
        throw new Error(
          `Another envy process is holding ${lockPath}. Remove it if no envy is running.`,
        );
      }
      await Bun.sleep(WAIT_STEP_MS);
    }
  }

  try {
    return await work();
  } finally {
    await rm(lockPath, { recursive: true, force: true });
  }
}

// A lock left behind by a crashed process would block forever.
async function removeIfStale(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > STALE_AFTER_MS) {
      await rm(lockPath, { recursive: true, force: true });
    }
  } catch {
    // Already gone.
  }
}

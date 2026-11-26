import type { Clock } from "../../lib/clock.ts";
import type { Logger } from "../../lib/logger.ts";
import type { RunInTransaction } from "../../repositories.ts";
import { RESTORE_DAYS } from "./service.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Removes for good the projects deleted more than 30 days ago, with their
 * environments, encrypted secrets, wrapped keys, tokens, members, invites
 * and audit log. Returns how many were removed.
 */
export async function purgeDeletedProjects(dependencies: {
  runInTransaction: RunInTransaction;
  clock: Clock;
}): Promise<number> {
  const cutoff = new Date(dependencies.clock.now().getTime() - RESTORE_DAYS * DAY_MS);
  const purged = await dependencies.runInTransaction((transaction) =>
    transaction.projects.purgeDeletedBefore(cutoff),
  );
  return purged.length;
}

/**
 * Runs the purge when the API starts and then once a day, so deleted
 * projects go away without a separate cron job. Returns a stop function.
 */
export function schedulePurge(dependencies: {
  runInTransaction: RunInTransaction;
  clock: Clock;
  logger: Logger;
}): () => void {
  const run = async () => {
    try {
      const count = await purgeDeletedProjects(dependencies);
      if (count > 0) {
        dependencies.logger.info("Removed deleted projects for good", { count });
      }
    } catch (error) {
      dependencies.logger.error("Removing deleted projects failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  void run();
  const timer = setInterval(() => void run(), DAY_MS);
  return () => clearInterval(timer);
}

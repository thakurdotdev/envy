import { and, asc, eq, isNull } from "drizzle-orm";
import type { Executor } from "../../db/executor.ts";
import { apps, projects, type AppRow } from "../../db/schema.ts";

export function createAppRepository(executor: Executor) {
  return {
    async create(input: { projectId: string; name: string }): Promise<AppRow> {
      const [app] = await executor.insert(apps).values(input).returning();
      if (app === undefined) {
        throw new Error("Saving the app returned no row.");
      }
      return app;
    },

    /** The project's apps that have not been removed, oldest first. */
    async listLive(projectId: string): Promise<AppRow[]> {
      return executor
        .select()
        .from(apps)
        .where(and(eq(apps.projectId, projectId), isNull(apps.deletedAt)))
        .orderBy(asc(apps.id));
    },

    /** An app that has not been removed, in a project that still exists. */
    async findLiveById(appId: string): Promise<AppRow | undefined> {
      const [row] = await executor
        .select({ app: apps })
        .from(apps)
        .innerJoin(projects, eq(projects.id, apps.projectId))
        .where(and(eq(apps.id, appId), isNull(apps.deletedAt), isNull(projects.deletedAt)));
      return row?.app;
    },

    /** Marks the app removed, only if it was not already. */
    async remove(appId: string, now: Date): Promise<boolean> {
      const updated = await executor
        .update(apps)
        .set({ deletedAt: now })
        .where(and(eq(apps.id, appId), isNull(apps.deletedAt)))
        .returning({ id: apps.id });
      return updated.length === 1;
    },
  };
}

export type AppRepository = ReturnType<typeof createAppRepository>;

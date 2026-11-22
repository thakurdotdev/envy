import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client.ts";

export const MIGRATIONS_FOLDER = new URL("./migrations", import.meta.url).pathname;

/** Applies every migration that has not run yet. Used by tests and at release. */
export async function runMigrations(database: Database): Promise<void> {
  await migrate(database, { migrationsFolder: MIGRATIONS_FOLDER });
}

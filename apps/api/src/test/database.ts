import postgres from "postgres";
import { createDatabase, type Database } from "../db/client.ts";
import { runMigrations } from "../db/migrate.ts";

// Integration tests use a real Postgres. Each test file gets its own new
// database, so files can run in any order and never see each other's rows.
const DEFAULT_URL = "postgres://appuser:appuser@localhost:5432/envy";

export type TestDatabase = {
  database: Database;
  drop: () => Promise<void>;
};

export async function createTestDatabase(): Promise<TestDatabase> {
  const adminUrl = process.env["TEST_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? DEFAULT_URL;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  const name = `envy_test_${crypto.randomUUID().replaceAll("-", "")}`;
  await admin.unsafe(`CREATE DATABASE "${name}"`);

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const { database, close } = createDatabase(url.toString());
  await runMigrations(database);

  return {
    database,
    async drop() {
      await close();
      await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      await admin.end();
    },
  };
}

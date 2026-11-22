import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export function createDatabase(databaseUrl: string) {
  const connection = postgres(databaseUrl, {
    // Postgres notices (for example "already exists, skipping") are not errors.
    onnotice: () => {},
  });
  const database = drizzle(connection, { schema, casing: "snake_case" });
  return { database, close: () => connection.end() };
}

export type Database = ReturnType<typeof createDatabase>["database"];

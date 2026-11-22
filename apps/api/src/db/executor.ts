import type { Database } from "./client.ts";

/** A database transaction. Has the same query methods as the database. */
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Something repositories can run queries on: the database or a transaction. */
export type Executor = Database | Transaction;

/** Postgres error code for "a unique index would have a duplicate". */
export function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error && "cause" in error ? error.cause : error;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

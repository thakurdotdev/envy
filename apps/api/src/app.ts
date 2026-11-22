import { Elysia } from "elysia";

/**
 * Builds the API. Each feature module is added here with `.use()` as it is
 * written, so this file stays a short list of modules.
 */
export function createApp() {
  return new Elysia().get("/health", () => ({ status: "ok" as const }));
}

/** The API's type. The CLI and web import only this, through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

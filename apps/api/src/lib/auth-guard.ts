import { Elysia } from "elysia";
import type { AuthService } from "../modules/auth/service.ts";

/**
 * Adds `actor` to every route registered after it, and answers 401 when the
 * request has no valid access token. Routes before it stay public.
 */
export function authGuard(auth: AuthService) {
  // No plugin name on purpose: Elysia skips a named plugin the second time it
  // is used, and every module needs its own copy of this hook.
  return new Elysia().resolve({ as: "scoped" }, async ({ headers }) => {
    const actor = await auth.authenticate(headers["authorization"]);
    return { actor };
  });
}

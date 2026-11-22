import { Elysia } from "elysia";
import type { Actor } from "../modules/auth/service.ts";
import { getClientIp } from "./client-ip.ts";
import type { RequestContext } from "./request-context.ts";

/** Turns an Authorization header into the actor, or throws a 401. */
export type Authenticate = (authorizationHeader: string | undefined) => Promise<Actor>;

/**
 * Adds `actor` and `context` to every route registered after it, and answers
 * 401 when the request has no valid access token or service token. Routes
 * before it stay public.
 */
export function authGuard(authenticate: Authenticate, trustProxy: boolean) {
  // No plugin name on purpose: Elysia skips a named plugin the second time it
  // is used, and every module needs its own copy of this hook.
  return new Elysia().resolve({ as: "scoped" }, async ({ headers, request, server }) => {
    const actor = await authenticate(headers["authorization"]);
    const context: RequestContext = {
      actor,
      ip: getClientIp(request, server, trustProxy),
      userAgent: headers["user-agent"]?.slice(0, 300) ?? null,
    };
    return { actor, context };
  });
}

import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { requireUser } from "../../lib/request-context.ts";
import { KeyMaterialBody } from "./schema.ts";
import type { UserService } from "./service.ts";

export function userRoutes({
  authenticate,
  users,
  trustProxy,
  writeLimiter,
}: {
  authenticate: Authenticate;
  users: UserService;
  trustProxy: boolean;
  writeLimiter: RateLimiter;
}) {
  return new Elysia()
    .use(authGuard(authenticate, trustProxy, writeLimiter))
    .get("/v1/me", ({ actor }) => users.getProfile(requireUser(actor)))
    .put("/v1/me/keys", ({ actor, body }) => users.setKeys(requireUser(actor), body), {
      body: KeyMaterialBody,
    });
}

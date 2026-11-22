import { Elysia } from "elysia";
import { authGuard } from "../../lib/auth-guard.ts";
import type { AuthService } from "../auth/service.ts";
import { KeyMaterialBody } from "./schema.ts";
import type { UserService } from "./service.ts";

export function userRoutes({
  auth,
  users,
  trustProxy,
}: {
  auth: AuthService;
  users: UserService;
  trustProxy: boolean;
}) {
  return new Elysia()
    .use(authGuard(auth, trustProxy))
    .get("/v1/me", ({ actor }) => users.getProfile(actor))
    .put("/v1/me/keys", ({ actor, body }) => users.setKeys(actor, body), { body: KeyMaterialBody });
}

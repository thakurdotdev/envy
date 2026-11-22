import { Elysia } from "elysia";
import { authGuard } from "../../lib/auth-guard.ts";
import type { AuthService } from "../auth/service.ts";
import { KeyMaterialBody } from "./schema.ts";
import type { UserService } from "./service.ts";

export function userRoutes({ auth, users }: { auth: AuthService; users: UserService }) {
  return new Elysia()
    .use(authGuard(auth))
    .get("/v1/me", ({ actor }) => users.getProfile(actor))
    .put("/v1/me/keys", ({ actor, body }) => users.setKeys(actor, body), { body: KeyMaterialBody });
}

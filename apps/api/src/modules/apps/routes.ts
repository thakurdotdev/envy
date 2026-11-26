import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import type { RateLimiter } from "../../lib/rate-limit.ts";
import { AppIdParams, CreateAppBody, ProjectIdParams } from "./schema.ts";
import type { AppService } from "./service.ts";

export function appRoutes(dependencies: {
  authenticate: Authenticate;
  apps: AppService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, apps, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get("/v1/projects/:id/apps", ({ context, params }) => apps.listApps(context, params.id), {
      params: ProjectIdParams,
    })
    .post(
      "/v1/projects/:id/apps",
      async ({ context, params, body, set }) => {
        const app = await apps.createApp(context, params.id, body);
        set.status = 201;
        return app;
      },
      { params: ProjectIdParams, body: CreateAppBody },
    )
    .delete(
      "/v1/apps/:id",
      async ({ context, params, set }) => {
        await apps.removeApp(context, params.id);
        set.status = 204;
      },
      { params: AppIdParams },
    );
}

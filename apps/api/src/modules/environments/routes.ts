import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { RotationSchema } from "../members/schema.ts";
import { CreateEnvironmentBody, EnvironmentIdParams, KeyQuery, ProjectIdParams } from "./schema.ts";
import { t } from "elysia";
import type { EnvironmentService } from "./service.ts";

export function environmentRoutes(dependencies: {
  authenticate: Authenticate;
  environments: EnvironmentService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, environments, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get(
      "/v1/projects/:id/environments",
      ({ context, params }) => environments.listEnvironments(context, params.id),
      { params: ProjectIdParams },
    )
    .post(
      "/v1/projects/:id/environments",
      async ({ context, params, body, set }) => {
        const environment = await environments.createEnvironment(context, params.id, body);
        set.status = 201;
        return environment;
      },
      { params: ProjectIdParams, body: CreateEnvironmentBody },
    )
    .post(
      "/v1/environments/:id/rotate",
      ({ context, params, body }) => environments.rotate(context, params.id, body),
      { params: EnvironmentIdParams, body: t.Omit(RotationSchema, ["environmentId"]) },
    )
    .get(
      "/v1/environments/:id/key",
      ({ context, params, query }) =>
        environments.getWrappedKey(context, params.id, query.keyVersion),
      { params: EnvironmentIdParams, query: KeyQuery },
    );
}

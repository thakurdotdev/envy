import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import {
  EnvironmentIdParams,
  ProjectIdParams,
  PushManyBody,
  PushSecretsBody,
  SecretsQuery,
  VersionsQuery,
} from "./schema.ts";
import type { SecretService } from "./service.ts";

export function secretRoutes(dependencies: {
  authenticate: Authenticate;
  secrets: SecretService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, secrets, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get(
      "/v1/environments/:id/secrets",
      ({ context, params, query }) => secrets.getSecrets(context, params.id, query.version),
      { params: EnvironmentIdParams, query: SecretsQuery },
    )
    .post(
      "/v1/environments/:id/secrets",
      async ({ context, params, body, set }) => {
        const created = await secrets.pushSecrets(context, params.id, body);
        set.status = 201;
        return created;
      },
      { params: EnvironmentIdParams, body: PushSecretsBody },
    )
    .post(
      "/v1/projects/:id/secrets",
      async ({ context, params, body, set }) => {
        const created = await secrets.pushMany(context, params.id, body.pushes);
        set.status = 201;
        return created;
      },
      { params: ProjectIdParams, body: PushManyBody },
    )
    .get(
      "/v1/environments/:id/versions",
      ({ context, params, query }) => secrets.listVersions(context, params.id, query),
      { params: EnvironmentIdParams, query: VersionsQuery },
    );
}

import { Elysia } from "elysia";
import { authGuard } from "../../lib/auth-guard.ts";
import type { AuthService } from "../auth/service.ts";
import { CreateEnvironmentBody, EnvironmentIdParams, KeyQuery, ProjectIdParams } from "./schema.ts";
import type { EnvironmentService } from "./service.ts";

export function environmentRoutes(dependencies: {
  auth: AuthService;
  environments: EnvironmentService;
  trustProxy: boolean;
}) {
  const { auth, environments, trustProxy } = dependencies;
  return new Elysia()
    .use(authGuard(auth, trustProxy))
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
    .get(
      "/v1/environments/:id/key",
      ({ context, params, query }) =>
        environments.getWrappedKey(context, params.id, query.keyVersion),
      { params: EnvironmentIdParams, query: KeyQuery },
    );
}

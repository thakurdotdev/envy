import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import { CreateProjectBody, ProjectIdParams, RenameProjectBody } from "./schema.ts";
import type { ProjectService } from "./service.ts";

export function projectRoutes(dependencies: {
  authenticate: Authenticate;
  projects: ProjectService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, projects, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get("/v1/projects", ({ context, query }) => projects.listProjects(context, query), {
      query: IdCursorQuery,
    })
    .post(
      "/v1/projects",
      async ({ context, body, set }) => {
        const project = await projects.createProject(context, body);
        set.status = 201;
        return project;
      },
      { body: CreateProjectBody },
    )
    .get("/v1/projects/deleted", ({ context }) => projects.listDeletedProjects(context))
    .post(
      "/v1/projects/:id/restore",
      ({ context, params }) => projects.restoreProject(context, params.id),
      {
        params: ProjectIdParams,
      },
    )
    .get("/v1/projects/:id", ({ context, params }) => projects.getProject(context, params.id), {
      params: ProjectIdParams,
    })
    .patch(
      "/v1/projects/:id",
      ({ context, params, body }) => projects.renameProject(context, params.id, body.name),
      { params: ProjectIdParams, body: RenameProjectBody },
    )
    .delete(
      "/v1/projects/:id",
      ({ context, params }) => projects.deleteProject(context, params.id),
      { params: ProjectIdParams },
    );
}

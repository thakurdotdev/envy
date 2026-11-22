import { Elysia } from "elysia";
import { authGuard } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import type { AuthService } from "../auth/service.ts";
import { CreateProjectBody, ProjectIdParams, RenameProjectBody } from "./schema.ts";
import type { ProjectService } from "./service.ts";

export function projectRoutes(dependencies: {
  auth: AuthService;
  projects: ProjectService;
  trustProxy: boolean;
}) {
  const { auth, projects, trustProxy } = dependencies;
  return new Elysia()
    .use(authGuard(auth, trustProxy))
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
      async ({ context, params, set }) => {
        await projects.deleteProject(context, params.id);
        set.status = 204;
      },
      { params: ProjectIdParams },
    );
}

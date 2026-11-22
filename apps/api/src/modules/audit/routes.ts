import { Elysia, t } from "elysia";
import { authGuard } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import type { AuthService } from "../auth/service.ts";
import type { AuditService } from "./service.ts";

export function auditRoutes(dependencies: {
  auth: AuthService;
  audit: AuditService;
  trustProxy: boolean;
}) {
  const { auth, audit, trustProxy } = dependencies;
  return new Elysia()
    .use(authGuard(auth, trustProxy))
    .get(
      "/v1/projects/:id/audit",
      ({ context, params, query }) => audit.listForProject(context, params.id, query),
      { params: t.Object({ id: t.String({ format: "uuid" }) }), query: IdCursorQuery },
    );
}

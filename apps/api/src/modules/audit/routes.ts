import { Elysia, t } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import type { AuditService } from "./service.ts";

export function auditRoutes(dependencies: {
  authenticate: Authenticate;
  audit: AuditService;
  trustProxy: boolean;
}) {
  const { authenticate, audit, trustProxy } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustProxy))
    .get(
      "/v1/projects/:id/audit",
      ({ context, params, query }) => audit.listForProject(context, params.id, query),
      { params: t.Object({ id: t.String({ format: "uuid" }) }), query: IdCursorQuery },
    );
}

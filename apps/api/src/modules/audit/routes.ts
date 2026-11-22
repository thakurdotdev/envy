import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia, t } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import type { AuditService } from "./service.ts";

export function auditRoutes(dependencies: {
  authenticate: Authenticate;
  audit: AuditService;
  trustProxy: boolean;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, audit, trustProxy, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustProxy, writeLimiter))
    .get(
      "/v1/projects/:id/audit",
      ({ context, params, query }) => audit.listForProject(context, params.id, query),
      { params: t.Object({ id: t.String({ format: "uuid" }) }), query: IdCursorQuery },
    );
}

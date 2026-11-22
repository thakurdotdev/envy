import type { RateLimiter } from "../../lib/rate-limit.ts";
import { Elysia, t } from "elysia";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { IdCursorQuery } from "../../lib/pagination.ts";
import type { AuditService } from "./service.ts";

export function auditRoutes(dependencies: {
  authenticate: Authenticate;
  audit: AuditService;
  trustedProxies: number;
  writeLimiter: RateLimiter;
}) {
  const { authenticate, audit, trustedProxies, writeLimiter } = dependencies;
  return new Elysia()
    .use(authGuard(authenticate, trustedProxies, writeLimiter))
    .get(
      "/v1/projects/:id/audit",
      ({ context, params, query }) => audit.listForProject(context, params.id, query),
      { params: t.Object({ id: t.String({ format: "uuid" }) }), query: IdCursorQuery },
    );
}

import type { ErrorCode } from "@envy/shared";
import { Elysia } from "elysia";
import { AppError, toErrorBody } from "./errors.ts";
import type { Logger } from "./logger.ts";
import { getClientIp } from "./client-ip.ts";
import type { RateLimiter } from "./rate-limit.ts";

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** The request path for logs, with invite tokens (which act like passwords) hidden. */
export function pathForLogs(url: string): string {
  return new URL(url).pathname.replace(/^\/v1\/invites\/[^/]+/, "/v1/invites/[redacted]");
}

/**
 * Request ids, one log line per request, and the single error handler that
 * gives every error the `{ "error": { "code", "message" } }` shape.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function httpBasics(
  logger: Logger,
  options: { writeLimiter?: RateLimiter; trustProxy?: boolean } = {},
) {
  return (
    new Elysia({ name: "http-basics" })
      // Every change (POST, PUT, PATCH, DELETE) counts against the caller's IP.
      .onBeforeHandle({ as: "global" }, ({ request, server, set }) => {
        if (options.writeLimiter === undefined || READ_METHODS.has(request.method)) {
          return;
        }
        const ip = getClientIp(request, server, options.trustProxy === true);
        if (!options.writeLimiter.allow(`ip:${ip}`)) {
          set.headers["retry-after"] = "60";
          throw new AppError(
            "RATE_LIMITED",
            "Too many requests. Wait a minute and try again.",
            429,
          );
        }
      })
      .derive({ as: "global" }, ({ request, set }) => {
        // Reuse the caller's id when it looks safe, so a request can be traced
        // from the CLI through the proxy to this log.
        const incomingId = request.headers.get("x-request-id");
        const requestId =
          incomingId !== null && REQUEST_ID_PATTERN.test(incomingId)
            ? incomingId
            : Bun.randomUUIDv7();
        set.headers["x-request-id"] = requestId;
        return { requestId, requestStartedAt: performance.now() };
      })
      .onAfterResponse({ as: "global" }, ({ request, set, requestId, requestStartedAt }) => {
        // Only the path is logged: query strings can hold OAuth codes.
        logger.info("request", {
          requestId,
          method: request.method,
          path: pathForLogs(request.url),
          status: set.status,
          durationMs: Math.round(performance.now() - requestStartedAt),
        });
      })
      .onError({ as: "global" }, ({ code, error, set, request }) => {
        // A plain Response keeps the error shape out of every route's success
        // type, so Eden clients see errors only as errors.
        const respond = (
          status: number,
          errorCode: ErrorCode,
          message: string,
          details?: Record<string, string | number>,
        ) => {
          // Also recorded on `set`, which the request log reads.
          set.status = status;
          const headers = new Headers({ "content-type": "application/json" });
          for (const [name, value] of Object.entries(set.headers)) {
            if (typeof value === "string" || typeof value === "number") {
              headers.set(name, String(value));
            }
          }
          return new Response(JSON.stringify(toErrorBody(errorCode, message, details)), {
            status,
            headers,
          });
        };

        if (error instanceof AppError) {
          return respond(error.httpStatus, error.code, error.message, error.details);
        }
        if (code === "VALIDATION") {
          // Name the field, never the value: the value could be a secret.
          const field = error.valueError?.path.replace(/^\//, "") || "the request";
          return respond(400, "VALIDATION_FAILED", `The value of ${field} is not valid.`);
        }
        if (code === "PARSE") {
          return respond(400, "VALIDATION_FAILED", "The request body could not be read as JSON.");
        }
        if (code === "NOT_FOUND") {
          return respond(404, "ROUTE_NOT_FOUND", "There is no such API route.");
        }
        logger.error("unexpected error", { path: pathForLogs(request.url), error });
        return respond(
          500,
          "INTERNAL_ERROR",
          "Something went wrong on the server. Try again later.",
        );
      })
  );
}

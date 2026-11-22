import type { ErrorCode, ErrorResponseBody } from "@envy/shared";

/**
 * The one error type the API throws on purpose. The error handler turns it
 * into `{ "error": { "code", "message" } }` with the given HTTP status.
 * The message is shown to users, so it must never contain secret values.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Record<string, string | number> | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, string | number>,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function toErrorBody(
  code: ErrorCode,
  message: string,
  details?: Record<string, string | number>,
): ErrorResponseBody {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}

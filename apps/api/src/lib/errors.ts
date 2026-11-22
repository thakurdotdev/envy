import type { ErrorCode, ErrorResponseBody } from "@envy/shared";

/**
 * The one error type the API throws on purpose. The error handler turns it
 * into `{ "error": { "code", "message" } }` with the given HTTP status.
 * The message is shown to users, so it must never contain secret values.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(code: ErrorCode, message: string, httpStatus: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function toErrorBody(code: ErrorCode, message: string): ErrorResponseBody {
  return { error: { code, message } };
}

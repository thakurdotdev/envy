// Every error the API can return has one of these codes. The CLI and the
// web map each code to a message that tells the user what to do next, so
// add a code here before using it anywhere else.

export const ERROR_CODES = [
  // General
  "VALIDATION_FAILED",
  "ROUTE_NOT_FOUND",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  // Sign-in and sessions
  "NOT_AUTHENTICATED",
  "ACCESS_TOKEN_INVALID",
  "SESSION_REVOKED",
  "REFRESH_TOKEN_INVALID",
  "REFRESH_TOKEN_REUSED",
  "SESSION_NOT_FOUND",
  "DEVICE_CODE_EXPIRED",
  "DEVICE_ACCESS_DENIED",
  "GITHUB_LOGIN_FAILED",
  "GITHUB_EMAIL_MISSING",
  "OAUTH_STATE_MISMATCH",
  // Users
  "KEYS_ALREADY_SET",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The body of every API error response. */
export type ErrorResponseBody = {
  error: {
    code: ErrorCode;
    message: string;
  };
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

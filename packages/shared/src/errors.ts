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
  "KEY_CHALLENGE_FAILED",
  // Projects, environments and secrets
  "FORBIDDEN",
  "PROJECT_NOT_FOUND",
  "PROJECT_SLUG_TAKEN",
  "ENVIRONMENT_NOT_FOUND",
  "ENVIRONMENT_NAME_TAKEN",
  "RECIPIENTS_MISMATCH",
  "KEY_NOT_FOUND",
  "VERSION_NOT_FOUND",
  "VERSION_CONFLICT",
  "KEY_VERSION_OUTDATED",
  "SECRETS_TOO_LARGE",
  // Apps in a monorepo (ADR 0018)
  "APP_NOT_FOUND",
  "APP_NAME_TAKEN",
  "APP_ENVIRONMENTS_MISMATCH",
  // Access per environment (ADR 0019)
  "NO_ENVIRONMENT_ACCESS",
  // Teams
  "KEYS_NOT_SET",
  "INVITE_NOT_FOUND",
  "INVITE_EMAIL_MISMATCH",
  "ALREADY_MEMBER",
  "MEMBER_NOT_FOUND",
  "MEMBER_NOT_PENDING",
  "OWNER_CANNOT_CHANGE",
  "ROTATION_MISMATCH",
  // Service tokens
  "TOKEN_NOT_FOUND",
  "TOKEN_NOT_ALLOWED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The body of every API error response. */
export type ErrorResponseBody = {
  error: {
    code: ErrorCode;
    message: string;
    /** Extra facts for some codes, for example `latestVersion` with VERSION_CONFLICT. */
    details?: Record<string, string | number>;
  };
};

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

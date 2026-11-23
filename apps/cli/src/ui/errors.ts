import type { ErrorCode } from "@envy/shared";
import { EXIT_CODES, type ExitCode } from "../core/errors.ts";

// What to tell the user for each API error code. The message from the API
// says what happened; this says what to do about it.
const FIXES: Record<ErrorCode, { hint?: string; exitCode: ExitCode }> = {
  VALIDATION_FAILED: { exitCode: EXIT_CODES.userError, hint: "Check the command and try again." },
  ROUTE_NOT_FOUND: {
    exitCode: EXIT_CODES.networkError,
    hint: "Update Envy, or check ENVY_API_URL.",
  },
  RATE_LIMITED: { exitCode: EXIT_CODES.networkError, hint: "Wait a minute and try again." },
  INTERNAL_ERROR: { exitCode: EXIT_CODES.networkError, hint: "Try again in a moment." },
  NOT_AUTHENTICATED: { exitCode: EXIT_CODES.authError, hint: "Run envy login." },
  ACCESS_TOKEN_INVALID: { exitCode: EXIT_CODES.authError, hint: "Run envy login." },
  SESSION_REVOKED: { exitCode: EXIT_CODES.authError, hint: "Run envy login." },
  REFRESH_TOKEN_INVALID: { exitCode: EXIT_CODES.authError, hint: "Run envy login." },
  REFRESH_TOKEN_REUSED: {
    exitCode: EXIT_CODES.authError,
    hint: "Run envy login. If you did not sign in elsewhere, sign out other devices from the dashboard.",
  },
  SESSION_NOT_FOUND: { exitCode: EXIT_CODES.userError },
  DEVICE_CODE_EXPIRED: { exitCode: EXIT_CODES.authError, hint: "Run envy login again." },
  DEVICE_ACCESS_DENIED: { exitCode: EXIT_CODES.authError, hint: "Run envy login again." },
  GITHUB_LOGIN_FAILED: { exitCode: EXIT_CODES.networkError, hint: "Try envy login again." },
  GITHUB_EMAIL_MISSING: {
    exitCode: EXIT_CODES.authError,
    hint: "Add and verify an email at https://github.com/settings/emails, then run envy login.",
  },
  OAUTH_STATE_MISMATCH: { exitCode: EXIT_CODES.authError, hint: "Start the sign-in again." },
  KEYS_ALREADY_SET: { exitCode: EXIT_CODES.userError, hint: "Run envy login to unlock instead." },
  KEY_CHALLENGE_FAILED: { exitCode: EXIT_CODES.authError, hint: "Run the command again." },
  FORBIDDEN: { exitCode: EXIT_CODES.userError, hint: "Ask a project admin for a higher role." },
  PROJECT_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Check .envy.json, or ask the project owner to invite you.",
  },
  PROJECT_SLUG_TAKEN: { exitCode: EXIT_CODES.userError, hint: "Pick a different project name." },
  ENVIRONMENT_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Run envy env ls to see the environments.",
  },
  ENVIRONMENT_NAME_TAKEN: { exitCode: EXIT_CODES.userError, hint: "Pick a different name." },
  RECIPIENTS_MISMATCH: {
    exitCode: EXIT_CODES.userError,
    hint: "Try again; the member list changed.",
  },
  KEY_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Ask a project admin to run envy members grant.",
  },
  VERSION_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Run envy history to see the versions.",
  },
  VERSION_CONFLICT: {
    exitCode: EXIT_CODES.userError,
    hint: "Run envy pull, check the changes, then push again.",
  },
  KEY_VERSION_OUTDATED: { exitCode: EXIT_CODES.userError, hint: "Run envy pull, then push again." },
  SECRETS_TOO_LARGE: {
    exitCode: EXIT_CODES.userError,
    hint: "Split the values across environments.",
  },
  KEYS_NOT_SET: {
    exitCode: EXIT_CODES.userError,
    hint: "They need to run envy login once to set up their keys.",
  },
  INVITE_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Ask a project admin for a new invite.",
  },
  INVITE_EMAIL_MISMATCH: {
    exitCode: EXIT_CODES.userError,
    hint: "Sign in with the GitHub account that uses that email, or ask for an invite to your email.",
  },
  ALREADY_MEMBER: { exitCode: EXIT_CODES.userError, hint: "Run envy members ls to see the team." },
  MEMBER_NOT_FOUND: {
    exitCode: EXIT_CODES.userError,
    hint: "Run envy members ls to see the team.",
  },
  MEMBER_NOT_PENDING: {
    exitCode: EXIT_CODES.userError,
    hint: "Run envy members ls to see the team.",
  },
  OWNER_CANNOT_CHANGE: { exitCode: EXIT_CODES.userError },
  ROTATION_MISMATCH: {
    exitCode: EXIT_CODES.userError,
    hint: "Try again; the project changed meanwhile.",
  },
  TOKEN_NOT_FOUND: {
    exitCode: EXIT_CODES.authError,
    hint: "Check ENVY_TOKEN, or create a new token with envy token create.",
  },
  TOKEN_NOT_ALLOWED: {
    exitCode: EXIT_CODES.userError,
    hint: "Service tokens can only read their own environment. Sign in with envy login to change things.",
  },
};

export function fixForErrorCode(code: ErrorCode): { hint?: string; exitCode: ExitCode } {
  return FIXES[code];
}

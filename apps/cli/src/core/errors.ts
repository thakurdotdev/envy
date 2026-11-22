import type { ErrorCode } from "@envy/shared";

/** Exit codes the CLI promises in its docs. `envy run` uses the child's code. */
export const EXIT_CODES = {
  success: 0,
  userError: 1,
  authError: 2,
  networkError: 3,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/**
 * An error meant for the user. `message` says what happened and `hint` what
 * to do next. Neither may contain a secret value.
 */
export class CliError extends Error {
  readonly exitCode: ExitCode;
  readonly hint: string | undefined;
  /** The API error code, when the error came from the API. */
  readonly apiCode: ErrorCode | undefined;
  readonly details: Record<string, string | number> | undefined;

  constructor(
    message: string,
    options: {
      exitCode?: ExitCode;
      hint?: string | undefined;
      apiCode?: ErrorCode | undefined;
      details?: Record<string, string | number> | undefined;
    } = {},
  ) {
    super(message);
    this.name = "CliError";
    this.exitCode = options.exitCode ?? EXIT_CODES.userError;
    this.hint = options.hint;
    this.apiCode = options.apiCode;
    this.details = options.details;
  }
}

export function notLoggedIn(): CliError {
  return new CliError("You are not signed in.", {
    exitCode: EXIT_CODES.authError,
    hint: "Run envy login.",
  });
}

export function notLinked(): CliError {
  return new CliError("This folder is not linked to a project.", { hint: "Run envy init." });
}

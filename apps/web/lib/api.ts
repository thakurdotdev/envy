import { treaty, type Treaty } from "@elysiajs/eden";
// Type only: the dashboard never bundles the API's code, just its route types.
import type { App } from "@envy/api";
import { isErrorCode, type ErrorCode } from "@envy/shared";

export const API_URL = (process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

export type ApiClient = Treaty.Create<App>;

/** An error answer from the API, with its shared error code. */
export class ApiError extends Error {
  readonly code: ErrorCode | "NETWORK_ERROR";
  readonly details: Record<string, string | number>;

  constructor(
    code: ErrorCode | "NETWORK_ERROR",
    message: string,
    details: Record<string, string | number> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

type EdenResult<Data> = {
  data: Data | null;
  error: { status: unknown; value: unknown } | null;
  status: number;
};

// The access token lives only in this variable: never in storage, never in a cookie.
let accessToken: string | undefined;
let refreshInFlight: Promise<string> | undefined;

const api: ApiClient = treaty<App>(API_URL, {
  // The refresh token is an httpOnly cookie for /v1/auth; the browser adds it.
  fetch: { credentials: "include" },
  headers: () => (accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
});

export function forgetAccessToken(): void {
  accessToken = undefined;
}

export function signInUrl(): string {
  return `${API_URL}/v1/auth/github/login`;
}

async function sendOnce<Data>(
  request: (client: ApiClient) => Promise<EdenResult<Data>>,
): Promise<Data> {
  let result: EdenResult<Data>;
  try {
    result = await request(api);
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the Envy server. Check your connection.");
  }
  if (result.error === null) {
    // Eden sets data to null only for empty (204) responses, whose callers ignore it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return result.data as Data;
  }
  throw toApiError(result.error.value);
}

function toApiError(body: unknown): ApiError {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error: unknown = body.error;
    if (typeof error === "object" && error !== null && "code" in error && "message" in error) {
      const { code, message } = error;
      if (isErrorCode(code) && typeof message === "string") {
        const details: Record<string, string | number> = {};
        if ("details" in error && typeof error.details === "object" && error.details !== null) {
          for (const [name, value] of Object.entries(error.details)) {
            if (typeof value === "string" || typeof value === "number") {
              details[name] = value;
            }
          }
        }
        return new ApiError(code, message, details);
      }
    }
  }
  return new ApiError("INTERNAL_ERROR", "The server answered with an unexpected error. Try again.");
}

/**
 * Gets a new access token with the refresh cookie. Tabs take turns through a
 * Web Lock: the API ends the session when the same refresh token is used
 * twice, and each refresh replaces the cookie for every tab.
 */
export function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    try {
      return typeof navigator !== "undefined" && "locks" in navigator
        ? await navigator.locks.request("envy-refresh", refreshNow)
        : await refreshNow();
    } finally {
      refreshInFlight = undefined;
    }
  })();
  return refreshInFlight;
}

async function refreshNow(): Promise<string> {
  const result = await sendOnce((client) => client.v1.auth.refresh.post({}));
  accessToken = result.accessToken;
  return result.accessToken;
}

/** One API call. Refreshes the access token and retries once when it has expired. */
export async function call<Data>(
  request: (client: ApiClient) => Promise<EdenResult<Data>>,
): Promise<Data> {
  if (accessToken === undefined) {
    await refreshAccessToken();
  }
  try {
    return await sendOnce(request);
  } catch (error) {
    if (error instanceof ApiError && error.code === "ACCESS_TOKEN_INVALID") {
      await refreshAccessToken();
      return sendOnce(request);
    }
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    await sendOnce((client) => client.v1.auth.logout.post());
  } finally {
    forgetAccessToken();
  }
}

/** A message for the user; network and server faults get a plain fallback. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

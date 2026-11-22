import type { App } from "@envy/api";
import { treaty, type Treaty } from "@elysiajs/eden";
import { isErrorCode } from "@envy/shared";
import { fixForErrorCode } from "../ui/errors.ts";
import { CliError, EXIT_CODES, notLoggedIn } from "./errors.ts";
import { getKeystore, type StoredCredentials } from "./keystore.ts";
import { withLock } from "./lock.ts";
import { resolveApiUrl } from "./settings.ts";

export type ApiClient = Treaty.Create<App>;

/** The shape of every Eden Treaty response. */
type EdenResult<Data> = {
  data: Data | null;
  error: { status: unknown; value: unknown } | null;
  status: number;
};

// Refresh a minute early so a token never expires halfway through a command.
const REFRESH_MARGIN_MS = 60_000;

export function createPublicClient(apiUrl: string): ApiClient {
  return treaty<App>(apiUrl);
}

/**
 * Sends one API request and returns its data, or throws a CliError with the
 * fix for the API's error code. Network failures exit with code 3.
 */
export async function callApi<Data>(request: () => Promise<EdenResult<Data>>): Promise<Data> {
  let result: EdenResult<Data>;
  try {
    result = await request();
  } catch {
    throw new CliError("Could not reach the Envy server.", {
      exitCode: EXIT_CODES.networkError,
      hint: "Check your connection, or ENVY_API_URL if you use your own server.",
    });
  }
  if (result.error === null) {
    // Eden sets data to null only for empty (204) responses, whose callers ignore it.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return result.data as Data;
  }
  throw toCliError(result.status, result.error.value);
}

export function toCliError(status: number, body: unknown): CliError {
  const error = readErrorBody(body);
  if (error === undefined) {
    return new CliError(`The Envy server answered with an unexpected error (HTTP ${status}).`, {
      exitCode: EXIT_CODES.networkError,
      hint: "Try again in a moment.",
    });
  }
  const fix = fixForErrorCode(error.code);
  return new CliError(error.message, {
    exitCode: fix.exitCode,
    hint: fix.hint,
    apiCode: error.code,
    details: error.details,
  });
}

function readErrorBody(body: unknown) {
  if (typeof body !== "object" || body === null || !("error" in body)) {
    return undefined;
  }
  const error: unknown = body.error;
  if (typeof error !== "object" || error === null || !("code" in error) || !("message" in error)) {
    return undefined;
  }
  const { code, message } = error;
  if (!isErrorCode(code) || typeof message !== "string") {
    return undefined;
  }
  const details: Record<string, string | number> = {};
  if ("details" in error && typeof error.details === "object" && error.details !== null) {
    for (const [name, value] of Object.entries(error.details)) {
      if (typeof value === "string" || typeof value === "number") {
        details[name] = value;
      }
    }
  }
  return { code, message, details };
}

export type Session = {
  apiUrl: string;
  credentials: StoredCredentials;
  api: ApiClient;
  /** Like callApi, but refreshes the access token and retries once if it expired. */
  call<Data>(request: (api: ApiClient) => Promise<EdenResult<Data>>): Promise<Data>;
  saveCredentials(change: Partial<StoredCredentials>): Promise<void>;
};

/** The signed-in session for the configured API, or "not signed in". */
export async function openSession(): Promise<Session> {
  const apiUrl = await resolveApiUrl();
  const keystore = getKeystore();
  const stored = await keystore.load(apiUrl);
  if (stored === undefined) {
    throw notLoggedIn();
  }
  let credentials = stored;

  const api = treaty<App>(apiUrl, {
    headers: () => ({ authorization: `Bearer ${credentials.accessToken}` }),
  });

  async function refresh(): Promise<void> {
    const usedAccessToken = credentials.accessToken;
    credentials = await withLock("refresh", async () => {
      // Another envy process may have refreshed while we waited for the lock.
      const latest = (await keystore.load(apiUrl)) ?? credentials;
      if (latest.accessToken !== usedAccessToken && latest.accessTokenExpiresAt > Date.now()) {
        return latest;
      }
      const refreshed = await callApi(() =>
        createPublicClient(apiUrl).v1.auth.refresh.post({ refreshToken: latest.refreshToken }),
      );
      if (!("refreshToken" in refreshed)) {
        throw new CliError("The server did not return a new refresh token.", {
          exitCode: EXIT_CODES.networkError,
        });
      }
      const next: StoredCredentials = {
        ...latest,
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: Date.now() + refreshed.accessTokenExpiresIn * 1000,
        refreshToken: refreshed.refreshToken,
      };
      await keystore.save(next);
      return next;
    });
  }

  if (credentials.accessTokenExpiresAt - REFRESH_MARGIN_MS < Date.now()) {
    await refresh();
  }

  return {
    apiUrl,
    get credentials() {
      return credentials;
    },
    api,
    async call(request) {
      try {
        return await callApi(() => request(api));
      } catch (error) {
        if (error instanceof CliError && error.apiCode === "ACCESS_TOKEN_INVALID") {
          await refresh();
          return callApi(() => request(api));
        }
        throw error;
      }
    },
    async saveCredentials(change) {
      credentials = { ...credentials, ...change };
      await keystore.save(credentials);
    },
  };
}

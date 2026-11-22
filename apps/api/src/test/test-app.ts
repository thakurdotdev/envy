import { createApp } from "../app.ts";
import type { Config } from "../config.ts";
import { silentLogger } from "../lib/logger.ts";
import type { GitHubUser } from "../modules/auth/github.ts";
import { createTestDatabase } from "./database.ts";
import { createFakeGitHub } from "./fake-github.ts";

export const testConfig: Config = {
  environment: "test",
  port: 0,
  databaseUrl: "postgres://unused",
  apiUrl: "http://api.test",
  webUrl: "http://web.test",
  jwtSecret: "test-only-jwt-secret-that-is-long-enough",
  githubClientId: "test-client-id",
  githubClientSecret: "test-client-secret",
  trustProxy: false,
};

/** The API with a fresh database, a fake GitHub and a clock tests can move. */
export async function createTestApp() {
  const testDatabase = await createTestDatabase();
  const github = createFakeGitHub();
  let now = new Date("2026-11-22T12:00:00.000Z");
  const clock = { now: () => now };
  const app = createApp({
    config: testConfig,
    database: testDatabase.database,
    clock,
    logger: silentLogger,
    github: github.client,
  });

  async function request(method: string, path: string, options: RequestOptions = {}) {
    const headers = new Headers(options.headers);
    if (options.accessToken !== undefined) {
      headers.set("authorization", `Bearer ${options.accessToken}`);
    }
    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }
    const response = await app.handle(
      new Request(`http://api.test${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      }),
    );
    const text = await response.text();
    const body: unknown = text === "" ? undefined : JSON.parse(text);
    return { status: response.status, headers: response.headers, body };
  }

  return {
    app,
    github,
    request,
    database: testDatabase.database,
    advanceClock(milliseconds: number) {
      now = new Date(now.getTime() + milliseconds);
    },
    close: testDatabase.drop,
    /** Runs the whole CLI device sign-in for a GitHub user. */
    async signInWithCli(user: GitHubUser, deviceName = "test laptop") {
      const started = await request("POST", "/v1/auth/github/device");
      const deviceCode = readField(started.body, "deviceCode");
      github.approveDevice(deviceCode, user);
      const polled = await request("POST", "/v1/auth/github/device/poll", {
        body: { deviceCode, deviceName },
      });
      return {
        accessToken: readField(polled.body, "accessToken"),
        refreshToken: readField(polled.body, "refreshToken"),
        userId: readField(polled.body, "userId"),
      };
    },
  };
}

export type TestApp = Awaited<ReturnType<typeof createTestApp>>;

type RequestOptions = {
  accessToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

/** Reads a string field from a JSON body, failing the test if it is missing. */
export function readField(body: unknown, name: string): string {
  if (typeof body === "object" && body !== null && name in body) {
    const value: unknown = Object.getOwnPropertyDescriptor(body, name)?.value;
    if (typeof value === "string") {
      return value;
    }
  }
  throw new Error(`The response has no string field "${name}".`);
}

/** Reads `error.code` from an error response. */
export function readErrorCode(body: unknown): string | undefined {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error: unknown = body.error;
    if (typeof error === "object" && error !== null && "code" in error) {
      return typeof error.code === "string" ? error.code : undefined;
    }
  }
  return undefined;
}

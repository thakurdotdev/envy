import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { makeGitHubUser } from "../../test/fake-github.ts";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("CLI sign-in with the GitHub device flow", () => {
  test("pending until approved, then gives tokens that work", async () => {
    const user = makeGitHubUser("dana");
    const started = await testApp.request("POST", "/v1/auth/github/device");
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ userCode: "ABCD-1234", intervalSeconds: 5 });
    const deviceCode = readField(started.body, "deviceCode");

    const pending = await testApp.request("POST", "/v1/auth/github/device/poll", {
      body: { deviceCode, deviceName: "laptop" },
    });
    expect(pending.body).toEqual({ status: "pending" });

    testApp.github.approveDevice(deviceCode, user);
    const complete = await testApp.request("POST", "/v1/auth/github/device/poll", {
      body: { deviceCode, deviceName: "laptop" },
    });
    expect(complete.body).toMatchObject({ status: "complete", accessTokenExpiresIn: 900 });

    const me = await testApp.request("GET", "/v1/me", {
      accessToken: readField(complete.body, "accessToken"),
    });
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ githubLogin: "dana", email: user.email, keys: null });
  });

  test("signing in again keeps the same account", async () => {
    const user = makeGitHubUser("eli");

    const first = await testApp.signInWithCli(user);
    const second = await testApp.signInWithCli({ ...user, login: "eli-renamed" });

    expect(second.userId).toBe(first.userId);
  });
});

describe("refresh tokens", () => {
  test("each refresh gives a new refresh token and the old one stops working", async () => {
    const session = await testApp.signInWithCli(makeGitHubUser("fay"));

    const refreshed = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: session.refreshToken },
    });
    expect(refreshed.status).toBe(200);
    const nextRefreshToken = readField(refreshed.body, "refreshToken");
    expect(nextRefreshToken).not.toBe(session.refreshToken);

    const me = await testApp.request("GET", "/v1/me", {
      accessToken: readField(refreshed.body, "accessToken"),
    });
    expect(me.status).toBe(200);

    const again = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: nextRefreshToken },
    });
    expect(again.status).toBe(200);
  });

  test("using an old refresh token ends the whole session", async () => {
    const session = await testApp.signInWithCli(makeGitHubUser("gus"));
    const refreshed = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: session.refreshToken },
    });
    const currentRefreshToken = readField(refreshed.body, "refreshToken");
    const currentAccessToken = readField(refreshed.body, "accessToken");

    const reuse = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: session.refreshToken },
    });
    expect(reuse.status).toBe(401);
    expect(readErrorCode(reuse.body)).toBe("REFRESH_TOKEN_REUSED");

    const withCurrentToken = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: currentRefreshToken },
    });
    expect(readErrorCode(withCurrentToken.body)).toBe("SESSION_REVOKED");
    const me = await testApp.request("GET", "/v1/me", { accessToken: currentAccessToken });
    expect(readErrorCode(me.body)).toBe("SESSION_REVOKED");
  });

  test("a made-up refresh token is refused", async () => {
    const response = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: "0193a6f0-0000-7000-8000-000000000001.made-up" },
    });

    expect(response.status).toBe(401);
    expect(readErrorCode(response.body)).toBe("REFRESH_TOKEN_INVALID");
  });
});

describe("access tokens", () => {
  test("expire after 15 minutes", async () => {
    const session = await testApp.signInWithCli(makeGitHubUser("hal"));

    testApp.advanceClock(16 * 60 * 1000);
    const me = await testApp.request("GET", "/v1/me", { accessToken: session.accessToken });

    expect(me.status).toBe(401);
    expect(readErrorCode(me.body)).toBe("ACCESS_TOKEN_INVALID");
  });

  test("are required, and errors have the standard shape", async () => {
    const response = await testApp.request("GET", "/v1/me");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "NOT_AUTHENTICATED", message: "Sign in first." },
    });
  });
});

function readCookie(headers: Headers, name: string): string | undefined {
  for (const cookie of headers.getSetCookie()) {
    const [pair] = cookie.split(";");
    const [cookieName, value] = (pair ?? "").split("=");
    if (cookieName === name) {
      return value;
    }
  }
  return undefined;
}

describe("web sign-in", () => {
  test("redirects to GitHub, checks the state, and keeps the refresh token in a cookie", async () => {
    const user = makeGitHubUser("ivy");
    const start = await testApp.request("GET", "/v1/auth/github/login");
    expect(start.status).toBe(302);
    const githubUrl = new URL(start.headers.get("location") ?? "");
    const state = githubUrl.searchParams.get("state") ?? "";
    expect(readCookie(start.headers, "envy_oauth_state")).toBe(state);
    expect(githubUrl.searchParams.get("redirect_uri")).toBe(
      "http://api.test/v1/auth/github/callback",
    );

    testApp.github.allowWebCode("web-code-1", user);
    const callback = await testApp.request(
      "GET",
      `/v1/auth/github/callback?code=web-code-1&state=${state}`,
      { headers: { cookie: `envy_oauth_state=${state}` } },
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("http://web.test/");
    const refreshCookie = readCookie(callback.headers, "envy_refresh");
    expect(refreshCookie).toBeString();
    expect(callback.headers.getSetCookie().join(";")).toContain("HttpOnly");

    const refreshed = await testApp.request("POST", "/v1/auth/refresh", {
      headers: { cookie: `envy_refresh=${refreshCookie}` },
    });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body).not.toHaveProperty("refreshToken");
    expect(readCookie(refreshed.headers, "envy_refresh")).not.toBe(refreshCookie);
  });

  test("refuses a callback whose state does not match the browser's cookie", async () => {
    testApp.github.allowWebCode("web-code-2", makeGitHubUser("jon"));

    const callback = await testApp.request(
      "GET",
      "/v1/auth/github/callback?code=web-code-2&state=attacker-state",
      { headers: { cookie: "envy_oauth_state=real-state" } },
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "http://web.test/login?error=OAUTH_STATE_MISMATCH",
    );
    expect(readCookie(callback.headers, "envy_refresh")).toBeUndefined();
  });
});

describe("sessions", () => {
  test("a user sees their devices, can end another one, and cannot touch someone else's", async () => {
    const user = makeGitHubUser("kim");
    const laptop = await testApp.signInWithCli(user, "laptop");
    const desktop = await testApp.signInWithCli(user, "desktop");
    const stranger = await testApp.signInWithCli(makeGitHubUser("lou"));

    const list = await testApp.request("GET", "/v1/me/sessions", {
      accessToken: laptop.accessToken,
    });
    expect(list.body).toMatchObject({
      items: expect.arrayContaining([
        expect.objectContaining({ deviceName: "laptop", isCurrent: true }),
        expect.objectContaining({ deviceName: "desktop", isCurrent: false }),
      ]),
    });

    const desktopSessionId = desktop.refreshToken.split(".")[0] ?? "";
    const byStranger = await testApp.request("DELETE", `/v1/me/sessions/${desktopSessionId}`, {
      accessToken: stranger.accessToken,
    });
    expect(byStranger.status).toBe(404);

    const byOwner = await testApp.request("DELETE", `/v1/me/sessions/${desktopSessionId}`, {
      accessToken: laptop.accessToken,
    });
    expect(byOwner.status).toBe(204);
    const desktopMe = await testApp.request("GET", "/v1/me", { accessToken: desktop.accessToken });
    expect(readErrorCode(desktopMe.body)).toBe("SESSION_REVOKED");
  });

  test("logout ends the current session", async () => {
    const session = await testApp.signInWithCli(makeGitHubUser("max"));

    const logout = await testApp.request("POST", "/v1/auth/logout", {
      accessToken: session.accessToken,
    });
    expect(logout.status).toBe(204);

    const refresh = await testApp.request("POST", "/v1/auth/refresh", {
      body: { refreshToken: session.refreshToken },
    });
    expect(readErrorCode(refresh.body)).toBe("SESSION_REVOKED");
  });
});

describe("rate limits", () => {
  test("starting the device flow too often from one address is refused", async () => {
    const limited = await createTestApp();
    try {
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1) {
        statuses.push((await limited.request("POST", "/v1/auth/github/device")).status);
      }

      expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

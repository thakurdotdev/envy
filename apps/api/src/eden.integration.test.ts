import { treaty } from "@elysiajs/eden";
import { afterAll, beforeAll, describe, expect, expectTypeOf, test } from "bun:test";
import { makeGitHubUser } from "./test/fake-github.ts";
import { createTestApp, type TestApp } from "./test/test-app.ts";

// Calls every route through Eden Treaty, the typed client the CLI and the
// web use. If a route's types break, `bun check` fails on this file.

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
});

afterAll(async () => {
  await testApp.close();
});

describe("Eden Treaty client", () => {
  test("reaches every route with typed requests and responses", async () => {
    const api = treaty(testApp.app);
    const user = makeGitHubUser("quinn");

    const health = await api.health.get();
    expect(health.data?.status).toBe("ok");

    const started = await api.v1.auth.github.device.post();
    const deviceCode = started.data?.deviceCode ?? "";
    expectTypeOf(deviceCode).toBeString();
    testApp.github.approveDevice(deviceCode, user);

    const polled = await api.v1.auth.github.device.poll.post({ deviceCode, deviceName: "eden" });
    if (polled.data?.status !== "complete") {
      throw new Error("The device sign-in did not complete.");
    }
    const refreshed = await api.v1.auth.refresh.post({ refreshToken: polled.data.refreshToken });
    const accessToken = refreshed.data?.accessToken ?? "";
    const headers = { authorization: `Bearer ${accessToken}` };

    const me = await api.v1.me.get({ headers });
    expect(me.data?.githubLogin).toBe("quinn");
    expectTypeOf(me.data?.keys?.kdfParams.opsLimit).toEqualTypeOf<number | undefined>();

    const keys = await api.v1.me.keys.put(
      {
        publicKey: "A".repeat(43),
        encryptedPrivateKey: "A".repeat(98),
        recoveryEncryptedPrivateKey: "A".repeat(98),
        kdfSalt: "A".repeat(22),
        kdfParams: { algorithm: "argon2id13", opsLimit: 3, memLimitBytes: 64 * 1024 * 1024 },
      },
      { headers },
    );
    expect(keys.status).toBe(200);

    const sessions = await api.v1.me.sessions.get({ headers });
    const otherSession = await testApp.signInWithCli(user, "other");
    const otherSessionId = otherSession.refreshToken.split(".")[0] ?? "";
    expect(sessions.data?.items[0]?.isCurrent).toBe(true);
    const removed = await api.v1.me.sessions({ id: otherSessionId }).delete(undefined, { headers });
    expect(removed.status).toBe(204);

    const login = await api.v1.auth.github.login.get({ fetch: { redirect: "manual" } });
    expect(login.status).toBe(302);
    const callback = await api.v1.auth.github.callback.get({
      query: { error: "access_denied" },
      fetch: { redirect: "manual" },
    });
    expect(callback.status).toBe(302);

    const logout = await api.v1.auth.logout.post(undefined, { headers });
    expect(logout.status).toBe(204);
  });
});

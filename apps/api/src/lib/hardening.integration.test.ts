import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { signUpWithKeys } from "../test/crypto-client.ts";
import { createTestApp, readErrorCode, type TestApp } from "../test/test-app.ts";

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp({ environment: "production" });
});

afterAll(async () => {
  await testApp.close();
});

describe("hardening", () => {
  test("every response carries the security headers, errors included", async () => {
    for (const path of ["/health", "/v1/me", "/no-such-route"]) {
      const response = await testApp.request("GET", path);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(response.headers.get("strict-transport-security")).toContain("max-age=");
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    }
  });

  test("CORS only allows the dashboard's origin", async () => {
    const allowed = await testApp.request("GET", "/health", {
      headers: { origin: "http://web.test" },
    });
    const other = await testApp.request("GET", "/health", {
      headers: { origin: "https://evil.example" },
    });

    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://web.test");
    expect(other.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });

  test("one user cannot make more than 120 changes a minute, even from many addresses", async () => {
    const behindProxy = await createTestApp({ trustProxy: true });
    try {
      const user = await signUpWithKeys(behindProxy, "busy");
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 121; attempt += 1) {
        // A new address each time, so only the per-user limit can stop it.
        const response = await behindProxy.request(
          "PATCH",
          "/v1/members/0193a6f0-0000-7000-8000-000000000001",
          {
            accessToken: user.accessToken,
            body: { role: "viewer" },
            headers: { "x-forwarded-for": `203.0.113.${attempt % 250}` },
          },
        );
        statuses.push(response.status);
      }

      // Uploading the keys during sign-up was change number 1, so the 120th PATCH is refused.
      expect(statuses.slice(0, 119).every((status) => status === 404)).toBe(true);
      expect(statuses.slice(119)).toEqual([429, 429]);
    } finally {
      await behindProxy.close();
    }
  });

  test("anonymous writes from one address are limited too", async () => {
    const fresh = await createTestApp();
    try {
      let last: Awaited<ReturnType<TestApp["request"]>> | undefined;
      for (let attempt = 0; attempt < 121; attempt += 1) {
        last = await fresh.request("POST", "/v1/invites/aaaaaaaaaaaaaaaaaaaaaaaa/accept");
      }
      expect(readErrorCode(last?.body)).toBe("RATE_LIMITED");
    } finally {
      await fresh.close();
    }
  });
});

import { describe, expect, test } from "bun:test";
import { createLogger } from "./logger.ts";

describe("logger", () => {
  test("redacts sensitive fields at any depth", () => {
    const lines: string[] = [];
    const logger = createLogger((line) => lines.push(line));

    logger.info("request", {
      path: "/v1/me",
      headers: { Authorization: "Bearer abc", "x-request-id": "1" },
      body: { refreshToken: "r1", nested: [{ masterPassword: "p1", publicKey: "k1", name: "ok" }] },
      ciphertext: "c1",
    });

    const line = lines[0] ?? "";
    for (const secret of ["abc", "r1", "p1", "k1", "c1"]) {
      expect(line).not.toContain(secret);
    }
    expect(JSON.parse(line)).toMatchObject({
      level: "info",
      message: "request",
      path: "/v1/me",
      headers: { "x-request-id": "1" },
      body: { nested: [{ name: "ok" }] },
    });
  });
});

import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { AppError } from "./errors.ts";
import { httpBasics } from "./http.ts";
import { createLogger } from "./logger.ts";

describe("httpBasics", () => {
  test("logs the real status and request id of an error response", async () => {
    const lines: string[] = [];
    const app = new Elysia()
      .use(httpBasics(createLogger((line) => lines.push(line))))
      .get("/fail", () => {
        throw new AppError("RATE_LIMITED", "Too many requests.", 429);
      });

    const response = await app.handle(
      new Request("http://localhost/fail?code=oauth-code", {
        headers: { "x-request-id": "trace-12345" },
      }),
    );
    // The log line is written after the response is sent.
    await Bun.sleep(5);

    expect(response.status).toBe(429);
    expect(response.headers.get("x-request-id")).toBe("trace-12345");
    expect(await response.json()).toEqual({
      error: { code: "RATE_LIMITED", message: "Too many requests." },
    });
    const logged: unknown = JSON.parse(lines[0] ?? "{}");
    expect(logged).toMatchObject({ requestId: "trace-12345", path: "/fail", status: 429 });
    expect(lines.join("\n")).not.toContain("oauth-code");
  });
});

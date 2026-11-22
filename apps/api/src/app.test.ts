import { describe, expect, test } from "bun:test";
import { createApp } from "./app.ts";

describe("GET /health", () => {
  test("answers without auth so uptime checks can reach it", async () => {
    const response = await createApp().handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

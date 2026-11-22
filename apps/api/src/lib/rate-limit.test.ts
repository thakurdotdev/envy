import { describe, expect, test } from "bun:test";
import { createRateLimiter } from "./rate-limit.ts";

describe("rate limiter", () => {
  test("allows the limit, blocks after it, and allows again in the next window", () => {
    let now = 0;
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 }, { now: () => new Date(now) });

    expect([limiter.allow("a"), limiter.allow("a"), limiter.allow("a")]).toEqual([
      true,
      true,
      false,
    ]);
    expect(limiter.allow("b")).toBe(true);

    now = 1000;
    expect(limiter.allow("a")).toBe(true);
  });
});

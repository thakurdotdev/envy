import type { Clock } from "./clock.ts";

export type RateLimitRule = {
  /** How many requests are allowed in one window. */
  limit: number;
  windowMs: number;
};

export type RateLimiter = {
  /** Counts one request for the key. Returns false when the key is over its limit. */
  allow(key: string): boolean;
};

/**
 * Counts requests per key (for example "device:<ip>") in fixed time windows.
 * Counts live in memory, so they reset on restart and are per server process.
 * That is enough for one API instance; several instances would need a shared store.
 */
export function createRateLimiter(rule: RateLimitRule, clock: Clock): RateLimiter {
  const windows = new Map<string, { startedAt: number; count: number }>();

  function removeExpiredWindows(now: number): void {
    for (const [key, window] of windows) {
      if (now - window.startedAt >= rule.windowMs) {
        windows.delete(key);
      }
    }
  }

  return {
    allow(key) {
      const now = clock.now().getTime();
      // Clean up now and then so the map cannot grow without limit.
      if (windows.size > 10_000) {
        removeExpiredWindows(now);
      }
      const window = windows.get(key);
      if (window === undefined || now - window.startedAt >= rule.windowMs) {
        windows.set(key, { startedAt: now, count: 1 });
        return true;
      }
      window.count += 1;
      return window.count <= rule.limit;
    },
  };
}

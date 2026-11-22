import type { Server } from "bun";
import { getClientIp } from "./client-ip.ts";
import { AppError } from "./errors.ts";
import type { RateLimiter } from "./rate-limit.ts";

type HookContext = {
  request: Request;
  server: Server<unknown> | null;
  set: { headers: Record<string, string | number> };
};

/** A `beforeHandle` hook that answers 429 when one IP sends too many requests. */
export function limitByIp(limiter: RateLimiter, name: string, trustProxy: boolean) {
  return ({ request, server, set }: HookContext): void => {
    const ip = getClientIp(request, server, trustProxy);
    if (!limiter.allow(`${name}:${ip}`)) {
      set.headers["retry-after"] = 60;
      throw new AppError("RATE_LIMITED", "Too many requests. Wait a minute and try again.", 429);
    }
  };
}

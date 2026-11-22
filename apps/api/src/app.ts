import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import type { Config } from "./config.ts";
import type { Database } from "./db/client.ts";
import type { Clock } from "./lib/clock.ts";
import { httpBasics } from "./lib/http.ts";
import type { Logger } from "./lib/logger.ts";
import { createRateLimiter } from "./lib/rate-limit.ts";
import type { GitHubClient } from "./modules/auth/github.ts";
import { createSessionRepository } from "./modules/auth/repository.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { createAuthService } from "./modules/auth/service.ts";
import { createUserRepository } from "./modules/users/repository.ts";
import { userRoutes } from "./modules/users/routes.ts";
import { createUserService } from "./modules/users/service.ts";

/** Everything the API needs from outside. Tests pass their own versions. */
export type AppDependencies = {
  config: Config;
  database: Database;
  clock: Clock;
  logger: Logger;
  github: GitHubClient;
};

const MINUTE_MS = 60_000;

/**
 * Builds the API. Each feature module is added here with `.use()`, so this
 * file stays a short list of modules.
 */
export function createApp(dependencies: AppDependencies) {
  const { config, database, clock, logger, github } = dependencies;

  const sessionRepository = createSessionRepository(database);
  const userRepository = createUserRepository(database);
  const auth = createAuthService({
    config,
    clock,
    github,
    sessions: sessionRepository,
    users: userRepository,
  });
  const users = createUserService({ users: userRepository });

  // The CLI polls about every 5 seconds while the user approves the sign-in.
  const rateLimiters = {
    deviceStart: createRateLimiter({ limit: 10, windowMs: MINUTE_MS }, clock),
    devicePoll: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }, clock),
    webLogin: createRateLimiter({ limit: 20, windowMs: MINUTE_MS }, clock),
    refresh: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }, clock),
  };

  return new Elysia()
    .use(httpBasics(logger))
    .use(cors({ origin: config.webUrl, credentials: true }))
    .get("/health", () => ({ status: "ok" as const }))
    .use(authRoutes({ auth, config, rateLimiters }))
    .use(userRoutes({ auth, users }));
}

/** The API's type. The CLI and web import only this, through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

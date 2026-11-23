import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { servesOverHttps, type Config } from "./config.ts";
import type { Database } from "./db/client.ts";
import type { Clock } from "./lib/clock.ts";
import { httpBasics } from "./lib/http.ts";
import { securityHeaders } from "./lib/security-headers.ts";
import type { Logger } from "./lib/logger.ts";
import { createRateLimiter } from "./lib/rate-limit.ts";
import type { GitHubClient } from "./modules/auth/github.ts";
import { createSessionRepository } from "./modules/auth/repository.ts";
import { authRoutes } from "./modules/auth/routes.ts";
import { createAuthService } from "./modules/auth/service.ts";
import { createUserRepository } from "./modules/users/repository.ts";
import { userRoutes } from "./modules/users/routes.ts";
import { createUserService } from "./modules/users/service.ts";
import { createAccessChecker } from "./lib/access.ts";
import { auditRoutes } from "./modules/audit/routes.ts";
import { createAuditService } from "./modules/audit/service.ts";
import { environmentRoutes } from "./modules/environments/routes.ts";
import { createEnvironmentService } from "./modules/environments/service.ts";
import { projectRoutes } from "./modules/projects/routes.ts";
import { createProjectService } from "./modules/projects/service.ts";
import { secretRoutes } from "./modules/secrets/routes.ts";
import { createSecretService } from "./modules/secrets/service.ts";
import { createRepositories, createRunInTransaction } from "./repositories.ts";
import { memberRoutes } from "./modules/members/routes.ts";
import { createMemberService } from "./modules/members/service.ts";
import { tokenRoutes } from "./modules/tokens/routes.ts";
import { createTokenService } from "./modules/tokens/service.ts";
import type { Authenticate } from "./lib/auth-guard.ts";

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
  const users = createUserService({
    users: userRepository,
    challengeSecret: config.jwtSecret,
    clock,
  });

  const repositories = createRepositories(database);
  const runInTransaction = createRunInTransaction(database);
  const access = createAccessChecker(repositories);
  const projects = createProjectService({ repositories, runInTransaction, access, clock });
  const environments = createEnvironmentService({ repositories, runInTransaction, access, clock });
  const secrets = createSecretService({ repositories, runInTransaction, access });
  const audit = createAuditService({ audit: repositories.audit, access });
  const members = createMemberService({
    repositories,
    runInTransaction,
    access,
    clock,
    webUrl: config.webUrl,
  });
  const { trustedProxies } = config;
  const tokens = createTokenService({ repositories, runInTransaction, access, clock });
  // Service tokens start with "envy_"; everything else is a user's access token.
  const authenticate: Authenticate = (header) =>
    header?.startsWith("Bearer envy_") === true
      ? tokens.authenticate(header)
      : auth.authenticate(header);

  // The CLI polls about every 5 seconds while the user approves the sign-in.
  const rateLimiters = {
    deviceStart: createRateLimiter({ limit: 10, windowMs: MINUTE_MS }, clock),
    devicePoll: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }, clock),
    webLogin: createRateLimiter({ limit: 20, windowMs: MINUTE_MS }, clock),
    refresh: createRateLimiter({ limit: 30, windowMs: MINUTE_MS }, clock),
  };
  // Every change counts per IP and per user or token, on top of the auth limits.
  const writeLimiter = createRateLimiter({ limit: 120, windowMs: MINUTE_MS }, clock);

  return new Elysia()
    .use(httpBasics(logger, { writeLimiter, trustedProxies: config.trustedProxies }))
    .use(securityHeaders(servesOverHttps(config)))
    .use(cors({ origin: config.webUrl, credentials: true }))
    .get("/health", () => ({ status: "ok" as const }))
    .use(authRoutes({ auth, authenticate, writeLimiter, config, rateLimiters }))
    .use(userRoutes({ authenticate, users, trustedProxies, writeLimiter }))
    .use(projectRoutes({ authenticate, projects, trustedProxies, writeLimiter }))
    .use(environmentRoutes({ authenticate, environments, trustedProxies, writeLimiter }))
    .use(secretRoutes({ authenticate, secrets, trustedProxies, writeLimiter }))
    .use(memberRoutes({ authenticate, members, trustedProxies, writeLimiter }))
    .use(tokenRoutes({ authenticate, tokens, trustedProxies, writeLimiter }))
    .use(auditRoutes({ authenticate, audit, trustedProxies, writeLimiter }));
}

/** The API's type. The CLI and web import only this, through Eden Treaty. */
export type App = ReturnType<typeof createApp>;

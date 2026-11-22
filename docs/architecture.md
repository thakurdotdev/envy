# Architecture

Every module, what it does, and which modules it talks to. Update this file in
the same commit whenever a module is added, removed or changes its
dependencies.

| Module            | What it does                                                                                                              | Talks to                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `packages/shared` | Product name, shared API error codes, .env parser and writer                                                              | Nothing                            |
| `packages/crypto` | Every crypto function: master key (Argon2id), user keys, recovery key, env key wrapping, secrets encryption, fingerprints | libsodium only                     |
| `apps/api` lib    | Config check at boot, `AppError`, error handler, request ids, redacting logger, rate limiter, auth guard                  | Every module                       |
| `apps/api` auth   | GitHub device and web sign-in, access and refresh tokens, sessions (`/v1/auth/*`, `/v1/me/sessions`)                      | users repository, GitHub, Postgres |
| `apps/api` users  | Profile and first key setup (`/v1/me`, `/v1/me/keys`)                                                                     | auth service (guard), Postgres     |
| `apps/cli`        | Placeholder `envy` binary; typed API client (`src/core/api.ts`)                                                           | `packages/shared`, API types only  |
| `apps/web`        | Placeholder static Next.js page; typed API client (`lib/api.ts`)                                                          | API types only                     |

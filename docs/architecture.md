# Architecture

Every module, what it does, and which modules it talks to. Update this file in
the same commit whenever a module is added, removed or changes its
dependencies.

| Module            | What it does                                                                                                              | Talks to                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `packages/shared` | Product name constants. Later: error codes, dotenv parser                                                                 | Nothing                          |
| `packages/crypto` | Every crypto function: master key (Argon2id), user keys, recovery key, env key wrapping, secrets encryption, fingerprints | libsodium only                   |
| `apps/api`        | Elysia server with `GET /health`. Exports `type App`                                                                      | Postgres (Drizzle, from Phase 2) |
| `apps/cli`        | Placeholder `envy` binary                                                                                                 | `packages/shared`                |
| `apps/web`        | Placeholder static Next.js page                                                                                           | Nothing yet                      |

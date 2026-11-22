# AGENTS.md

Envy is a zero-knowledge tool for sharing `.env` secrets across a team: a CLI,
an API and a web dashboard. Secrets are encrypted on the user's machine; the
server only stores ciphertext and wrapped keys.

The full plan, with phase-by-phase tasks, is in [docs/PLAN.md](docs/PLAN.md).
Design decisions are in [docs/adr/](docs/adr/). Modules and how they connect
are in [docs/architecture.md](docs/architecture.md).

## How to work in this repo

1. Build one phase of `docs/PLAN.md` at a time, in order. Start a phase only
   when every acceptance check of the previous phase passes.
2. Inside a phase, do one task at a time: write tests, implement, run
   `bun run verify`, then commit with a Conventional Commit message
   (`feat(cli): add pull command`).
3. If the plan is unclear or looks wrong, stop and ask. Record any decision
   that changes the design as a short ADR in `docs/adr/`.
4. At the end of a phase, update the progress table in `docs/PLAN.md` and
   summarise what was built, what was skipped and any open questions.
5. **Never log, print or commit secret values, keys, tokens or passwords**,
   not even in tests or debug output.

## Stack

| Area         | Choice                                                  |
| ------------ | ------------------------------------------------------- |
| Runtime      | Bun 1.4.5 (pinned in `packageManager`), workspaces      |
| API          | Elysia, @elysiajs/jwt, @elysiajs/cors                   |
| Typed client | Eden Treaty (`@elysiajs/eden`)                          |
| Database     | PostgreSQL 16, Drizzle ORM, drizzle-kit migrations      |
| Crypto       | libsodium-wrappers-sumo                                 |
| CLI          | commander, @clack/prompts, picocolors, @napi-rs/keyring |
| Web          | Next.js static export, Tailwind, shadcn/ui              |
| Format       | `bun fmt`                                               |
| Lint         | oxlint + oxlint-tsgolint (ADR 0003; `bun lint` later)   |
| Type check   | `bun check -b`                                          |
| Tests        | `bun test`                                              |

Do not add ESLint, Prettier, Biome or `tsc`. `typescript` is allowed only in
`apps/web`, because `next build` needs it (ADR 0004).

## Folder layout

```
apps/api/        Elysia server. src/modules/<feature>/, src/db/, src/lib/, src/app.ts
apps/cli/        The envy CLI. src/commands/, src/core/, src/ui/
apps/web/        Next.js dashboard (static export)
packages/crypto/ Pure crypto functions. No I/O, no network, no logging. Imports only libsodium
packages/shared/ Constants, error codes, dotenv parser, shared types
packages/tsconfig/ Base tsconfig used by every package
docs/            PLAN.md, adr/, architecture.md, threat-model.md
```

Dependency direction: `apps/*` may import `packages/*`; packages never import
apps. The CLI and web import only the API's `type App`, never its runtime code.

## Commands

| Command                | What it does                                                                                                                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install`          | Install dependencies and set up the git hooks                                                                                                                                                       |
| `docker compose up -d` | Start a local Postgres 16 (set `ENVY_POSTGRES_PORT` if 5432 is busy)                                                                                                                                |
| `bun run verify`       | Format check, lint, type check and tests. Must pass before pushing                                                                                                                                  |
| `bun run format`       | Format every file                                                                                                                                                                                   |
| `bun run lint`         | Lint every file                                                                                                                                                                                     |
| `bun test`             | Run tests. Integration tests (`*.integration.test.ts`) need Postgres: they use `TEST_DATABASE_URL`, then `DATABASE_URL`, then the docker compose database, and make one throwaway database per file |
| `bun run dev`          | API on :3000 and web on :3001                                                                                                                                                                       |
| `bun run build`        | Build the CLI binary, the API binary and the static web site                                                                                                                                        |
| `bun run db:generate`  | Make a migration from `apps/api/src/db/schema.ts`                                                                                                                                                   |
| `bun run db:migrate`   | Apply migrations (reads `DATABASE_URL`, see `apps/api/.env.example`)                                                                                                                                |

The web dashboard's browser test needs Chromium once per machine:
`cd apps/web && bunx playwright install chromium`. UI components come from
shadcn/ui: add them with `bunx shadcn@4.23.0 add <name>` in `apps/web`, never by
hand (ADR 0010).

CLI environment variables (for scripts and tests): `ENVY_API_URL`, `ENVY_ENV`,
`ENVY_CONFIG_DIR`, `ENVY_KEYSTORE=file|keychain`, `ENVY_MASTER_PASSWORD`,
`ENVY_NO_BROWSER`, `ENVY_DEBUG=1`. See ADR 0008.

Never add a script called `check`: `bun check` would run it instead of the
type checker. The all-in-one script is `verify`.

## Engineering principles

### API module pattern

Each feature is a folder in `apps/api/src/modules/` with four files:

- `schema.ts` — Elysia `t` schemas for requests and responses. The single source of types.
- `routes.ts` — an Elysia plugin. Parses input, calls the service, shapes the response. No business logic, no SQL.
- `service.ts` — business rules and permission checks. Plain functions that take their dependencies as arguments.
- `repository.ts` — all database access for the module, via Drizzle. No other layer writes SQL.

`app.ts` adds each module with `.use()`. A new module touches its own folder
plus one line in `app.ts`.

### Code rules

- TypeScript `strict` and `noUncheckedIndexedAccess`. No `any`; use `unknown` and narrow.
- Validate at every boundary: HTTP input, env vars (`config.ts` at boot), files the CLI reads.
- One error type: `AppError(code, message, httpStatus)`. Codes live in `packages/shared/errors.ts`.
- API errors always look like `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "…" } }`.
- Short functions that do one thing. Split files over about 200 lines.
- Names say what things are (`wrapEnvKeyForMember`, not `doWrap`). No abbreviations except id, url, env.
- Comments explain why, not what. Every exported function in `packages/crypto` has a JSDoc block with inputs, outputs and security assumptions.
- No hidden global state: database client, config and clock are passed in.
- Dates in UTC, IDs are UUIDv7, timestamps are `timestamptz`.

### Plain language

- Simple, everyday words in code, comments, docs, commits, errors and CLI output.
- Explain an unavoidable technical term in one short sentence the first time it appears in a file.
- Clear, boring code over clever code. Split one-liners that need a second read.
- User-facing errors say what happened and what to do next. No stack traces or internal codes unless `--debug`.
- Update `docs/architecture.md` in the same commit whenever a module is added, removed or changes what it depends on.

### Security rules

- Plaintext secrets and private keys exist only in memory on the client. Never in logs, errors, analytics or the API.
- The logger redacts: password, token, key, secret, ciphertext, authorization.
- No custom crypto. Only call `packages/crypto`, which only calls libsodium.
- Dependencies are pinned (`bunfig.toml` saves exact versions; `bun.lock` is committed). Add one only when it saves real work, and say why in the PR.

### Testing

- Test what could break or cost something: crypto, permissions, version conflicts, key rotation, the dotenv parser, CLI flows, and every fixed bug.
- Do not test what TypeScript or the libraries already guarantee.
- One clear test per behaviour. Prefer tests through the real route or command.
- Crypto is the exception: every failure path stays tested.

### Git

- Conventional Commits, one task per commit or small PR.
- The pre-commit hook (`.githooks/pre-commit`, installed by `bun install`) formats staged files and lints them.
- `bun run verify` must pass before pushing.

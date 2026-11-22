# ADR 0001: Tech stack and repo layout

- Status: Accepted
- Date: 2026-11-22

## Context

Envy has three parts (CLI, API, web dashboard) that must share crypto code and
API types. We want one language, one package manager and as few tools to
install as possible.

## Decision

- One Bun monorepo using workspaces: `apps/api`, `apps/cli`, `apps/web`,
  `packages/crypto`, `packages/shared`, `packages/tsconfig`.
- Bun is pinned in the `packageManager` field of `package.json`, and CI reads
  the same field, so local and CI always run the same version.
- TypeScript everywhere, `strict` and `noUncheckedIndexedAccess` on, set once
  in `packages/tsconfig/base.json`.
- API: Elysia, with Eden Treaty to give the CLI and web typed API calls.
- Database: PostgreSQL 16 with Drizzle ORM and drizzle-kit migrations.
- Crypto: libsodium-wrappers-sumo only (see ADR 0002 for the compiled-binary
  check).
- Web: Next.js static export, so the dashboard is plain files.
- Tooling: `bun fmt` (format), `bun check` (type check), `bun test` (tests).
  Lint uses oxlint for now, see ADR 0003.
- The root script that runs every check is `verify`. It must never be called
  `check`, because `bun check` would then run the script instead of the type
  checker.

## Consequences

- A new developer installs Bun and runs `bun install`; nothing else is needed
  except a Postgres database.
- Packages are imported as TypeScript source (`exports` point at `src/`), so
  there is no build step between packages.
- Root `tsconfig.json` only lists project references; `bun check -b` checks
  every package with its own settings.

# Envy — Development Plan

22 Nov 2026 · Pankaj Thakur

## Progress

| Phase                                          | Status                                                |
| ---------------------------------------------- | ----------------------------------------------------- |
| Phase 0 — Foundation                           | Done (macOS keychain checked by the release workflow) |
| Phase 1 — Crypto package                       | Done                                                  |
| Phase 2 — API core: auth and users             | Done                                                  |
| Phase 3 — API: projects, environments, secrets | Done                                                  |
| Phase 4 — CLI core                             | Done                                                  |
| Phase 5 — Teams and access                     | Done                                                  |
| Phase 6 — Web dashboard                        | Done                                                  |
| Phase 7 — CI tokens and polish                 | Done                                                  |
| Phase 8 — Hardening and release                | Code done; deploy and first release pending           |
| Phase 9 — Monorepo apps                        | Done                                                  |
| Phase 10 — Project lifecycle and access        | In progress                                           |

Decisions that changed this plan are recorded in [docs/adr/](adr/).

## Overview and how to use this plan

Envy is a zero-knowledge tool for sharing `.env` secrets across a team: a CLI, an API and a web dashboard. Secrets are encrypted on the user's machine, so the server only ever stores ciphertext. The product goal is that after a one-time `envy init`, a developer only ever types `envy run` or `envy pull`.

Working name: Envy (CLI command `envy`). Rename freely; keep it in one constant in `packages/shared`.

### Instructions for the coding agent

1. Read this whole document before writing code. Save a copy as `docs/PLAN.md` in the repo.
2. Create an `AGENTS.md` at the repo root that summarises the stack, folder layout, commands and the rules in "Engineering principles".
3. Build one phase at a time, in order. Do not start a phase until the previous phase's acceptance criteria all pass.
4. Inside a phase, do one task at a time: write tests, implement, run `bun run verify` (format check + lint + type check + tests), then commit with a Conventional Commit message.
5. If something in this plan is ambiguous or seems wrong, stop and ask instead of guessing. Record any decision that changes the design as a short ADR in `docs/adr/`.
6. Never log, print or commit secret values, keys, tokens or passwords — not even in tests or debug output.
7. At the end of each phase, update `docs/PLAN.md` progress and summarise what was built, what was skipped and any open questions.

### Components

- **CLI (`envy`)** — the main product. Encrypts, decrypts, syncs and injects secrets.
- **API** — stores users, projects, encrypted blobs, wrapped keys and audit logs. Never sees plaintext.
- **Web dashboard** — manage projects, members, environments, history and tokens. Decrypts in the browser.
- **Shared packages** — crypto, types and schemas used by all three, so the logic exists once.

## Tech stack and repo structure

One Bun monorepo, TypeScript everywhere, with the API's types flowing to the CLI and web through Eden Treaty.

| Area                        | Choice                                                                 | Why                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Runtime and package manager | Bun 1.4.4 or newer (workspaces), version pinned in package.json and CI | Fast, native TS, `bun build --compile` for the CLI binary                                                    |
| API                         | Elysia + @elysiajs/jwt, @elysiajs/cors                                 | Matches the target org's stack; schemas give validation + types                                              |
| Typed client                | Eden Treaty (@elysiajs/eden)                                           | End-to-end types from API to CLI and web                                                                     |
| Database                    | PostgreSQL 16 + Drizzle ORM + drizzle-kit migrations                   | Typed SQL, plain migrations, easy to read                                                                    |
| Crypto                      | libsodium-wrappers-sumo                                                | Audited primitives; the sumo build is needed for Argon2id (`crypto_pwhash`)                                  |
| CLI                         | commander (args), @clack/prompts (interactive UI), picocolors          | Small, well known, good-looking prompts                                                                      |
| Web                         | Next.js static export + Tailwind + shadcn/ui                           | Plain static files; decryption already happens in the browser, so no server rendering is needed              |
| Format                      | `bun fmt` (built in, Prettier-compatible)                              | No Prettier or Biome to install                                                                              |
| Lint                        | `bun lint` (built in, ESLint and typescript-eslint rules, type-aware)  | No ESLint packages to install; `--staged` for git hooks. **See ADR 0003: oxlint until `bun lint` is stable** |
| Type check                  | `bun check` (built in)                                                 | No `tsc` needed; faster on large projects                                                                    |
| Tests                       | `bun test`                                                             | Built in; no extra config                                                                                    |
| Local infra                 | Docker Compose (Postgres, Mailpit for later email)                     | One command to start dependencies                                                                            |

> **Script name trap:** if package.json has a script called `check`, `bun check` runs that script instead of the type checker. So the root script that runs everything is called `verify`, never `check`.

### Folder layout

```
envy/
├─ apps/
│  ├─ api/            # Elysia server
│  │  ├─ src/
│  │  │  ├─ modules/    # one folder per feature
│  │  │  │  ├─ auth/       # routes.ts, service.ts, repository.ts, schema.ts, *.test.ts
│  │  │  │  ├─ users/
│  │  │  │  ├─ projects/
│  │  │  │  ├─ environments/
│  │  │  │  ├─ secrets/
│  │  │  │  ├─ members/
│  │  │  │  ├─ tokens/
│  │  │  │  └─ audit/
│  │  │  ├─ db/         # drizzle schema, client, migrations
│  │  │  ├─ lib/        # errors, auth guard, rate limit, logger
│  │  │  ├─ config.ts   # env vars validated at boot
│  │  │  └─ app.ts      # composes modules, exports `type App`
│  │  └─ index.ts       # starts the server
│  ├─ cli/
│  │  └─ src/
│  │     ├─ commands/   # one file per command: init.ts, pull.ts, run.ts …
│  │     ├─ core/       # api client, session, keystore, project link, env resolver
│  │     ├─ ui/         # output helpers, prompts, diff printer, errors
│  │     └─ index.ts
│  └─ web/               # Next.js dashboard
├─ packages/
│  ├─ crypto/          # pure crypto functions, no I/O, no network
│  ├─ shared/          # constants, error codes, dotenv parser, shared types
│  └─ tsconfig/        # base tsconfig shared by all
├─ docs/               # PLAN.md, adr/, threat-model.md
├─ docker-compose.yml
├─ bunfig.toml
├─ AGENTS.md
└─ package.json        # workspaces + root scripts: dev, verify, test, build
```

**Dependency direction:** `apps/*` may import `packages/*`. Packages never import apps. `packages/crypto` imports nothing except libsodium. The CLI and web import only the API's exported `type App`, never its runtime code.

## Engineering principles

Every feature lives in its own module with the same four layers, so adding a feature means adding a folder, not editing ten files.

### Module pattern (API)

- `schema.ts` — Elysia `t` schemas for request and response bodies. These are the single source of types.
- `routes.ts` — an Elysia plugin with the module's routes. Only parses input, calls the service and shapes the response. No business logic, no SQL.
- `service.ts` — business rules and permission checks. Plain functions that take dependencies as arguments, so they are easy to test.
- `repository.ts` — all database access for the module via Drizzle. No other layer writes SQL.
- `app.ts` registers each module with `.use()`. A new module touches only its own folder plus one line in `app.ts`.

### Code rules

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- Validate at every boundary: HTTP input (Elysia schemas), env vars (`config.ts` at boot), files the CLI reads (`.envy.json`, `.env`).
- One error type: `AppError(code, message, httpStatus)`. Error codes live in `packages/shared/errors.ts` and are shared with the CLI, so it can show a helpful fix for each code.
- API error shape is always `{ "error": { "code": "PROJECT_NOT_FOUND", "message": "…" } }`.
- Functions do one thing and stay short. Files over about 200 lines get split.
- Names say what things are: `wrapEnvKeyForMember`, not `doWrap`. No abbreviations except well-known ones (id, url, env).
- Comments explain why, not what, in plain words. Every exported function in `packages/crypto` gets a JSDoc block describing inputs, outputs and security assumptions.
- No hidden global state. Database client, config and clock are passed in, so tests can replace them.
- Dates in UTC, IDs are UUIDv7 (sortable), all timestamps `timestamptz`.

### Plain language

Code, comments, docs, commit messages, error messages and CLI output must be easy for any developer to understand, including someone new to the project.

- Use simple, everyday words. Write `getUserById`, not `resolveEntityByIdentifier`; write "the file could not be read", not "I/O fault encountered".
- Avoid jargon, buzzwords and clever abbreviations. When a technical term is unavoidable (for example "Argon2id" or "nonce"), explain it in one short sentence the first time it appears in a file or doc.
- Prefer clear, boring code over clever code. No one-liners that need a second read; split them into named steps.
- Error messages and CLI text are written for users: say what happened and what to do next, with no stack traces or internal codes unless `--debug` is set.
- One short `docs/architecture.md` lists every module, what it does and which modules it talks to. Update it in the same commit whenever a module is added, removed or changes what it depends on.

### Security rules for all code

- Plaintext secrets and private keys exist only in memory on the client. Never written to logs, error messages, analytics or the API.
- The logger has a redaction list (password, token, key, secret, ciphertext, authorization) applied to every log line.
- No custom crypto. Only call the functions in `packages/crypto`, which only call libsodium.
- Dependencies are pinned in `bun.lock`. Add a new dependency only when it saves real work; note why in the PR.

### Git workflow

- Conventional Commits (`feat(cli): add pull command`). One task per commit or small PR.
- Pre-commit hook (a plain `.git/hooks/pre-commit` or simple-git-hooks): `bun fmt` on staged files, then `bun lint --staged`. No lint-staged needed.
- `bun run verify` must pass before pushing.

## Security model and crypto design

The server stores only ciphertext and wrapped keys; decryption needs a key that only members hold, so a full database leak exposes no secrets.

Read top to bottom: each key unlocks the one below it, and only the bottom blob holds the actual secrets.

### Identity vs encryption

- **Identity (login)** — GitHub OAuth. The web uses the normal redirect flow; the CLI uses the GitHub device flow (browser opens, no copy-paste of tokens). The API then issues its own tokens: a 15-minute access JWT and a 30-day refresh token that rotates on every use and is stored hashed in the database.
- **Encryption (unlock)** — a master password chosen at signup. It never leaves the device. It is needed once per device; after that the unlocked private key is cached in the OS keychain.

### Key hierarchy

1. **Master key** = Argon2id(master password, per-user salt) via `crypto_pwhash`. Store the KDF parameters with the salt so they can be raised later.
2. **User keypair** (X25519, `crypto_box_keypair`). The public key is stored in plain form. The private key is encrypted with the master key and stored on the server, so the user can log in from any device.
3. **Recovery key** — 32 random bytes shown once at signup (as a word list or base32 string). It encrypts a second copy of the private key. Without the master password or the recovery key, data cannot be recovered; the UI must say this clearly.
4. **Environment key** — 32 random bytes per environment and key version. Never stored in plain form. One wrapped copy per member, made with `crypto_box_seal(envKey, memberPublicKey)`.
5. **Secret blob** — the whole environment as a JSON object `{ "KEY": "value" }`, encrypted with the environment key using XChaCha20-Poly1305 (`crypto_aead_xchacha20poly1305_ietf_encrypt`) and a fresh random 24-byte nonce.

### Rules the crypto package must enforce

- **Bind ciphertext to its place.** Use additional authenticated data (AAD) = `projectId | environmentId | version | keyVersion`. If the server swaps or replays a blob, decryption fails.
- **Version everything.** Every stored blob starts with a format version byte, so the algorithm can change later without breaking old data.
- **Constant interfaces.** Export a small set of functions: `deriveMasterKey`, `generateUserKeys`, `encryptPrivateKey`, `decryptPrivateKey`, `generateEnvKey`, `wrapEnvKey`, `unwrapEnvKey`, `encryptSecrets`, `decryptSecrets`, `generateRecoveryKey`, `fingerprint`.
- **Same code everywhere.** The CLI and the web both use `packages/crypto`, so a blob written by one is always readable by the other.
- **Best effort to clear key buffers** after use (`sodium.memzero`). JavaScript cannot guarantee this, so keep keys in memory for as short a time as possible.

### Access changes

- **Adding a member** — the invitee signs up and gets a keypair. An existing admin's client unwraps the environment key and re-wraps it for the new member's public key. The server cannot do this step.
- **Removing a member** — the admin's client creates a new key version, re-encrypts the latest secrets and wraps the new key for remaining members. The CLI then tells the admin to also rotate the real credentials, because the removed person may have copies.
- **Service tokens (CI)** — the client creates a keypair for the token and wraps the environment key for it. The token string shown once is `envy_<tokenId>_<privateKey>`. The server stores only a hash of the token ID part and the wrapped key, so zero-knowledge still holds.

### Threat model (summary)

| Threat                                        | Result                                   | Mitigation                                                                                                   |
| --------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Database or backup leaked                     | Only ciphertext and wrapped keys exposed | Zero-knowledge design; Argon2id slows password guessing                                                      |
| Malicious or hacked server swaps blobs        | Decryption fails                         | AAD binding + version checks                                                                                 |
| Server substitutes a public key during invite | Could grant itself access                | Show key fingerprints on invite and in `envy members`; verifying them is documented. Known limitation for v1 |
| Stolen laptop                                 | Attacker gets cached keys                | OS keychain; `envy logout` and session revoke from the web                                                   |
| Removed member kept copies                    | Old values known                         | Key rotation + prompt to rotate real credentials                                                             |
| Brute-force login or token guessing           | Account abuse                            | Rate limiting per IP and per user; long random tokens                                                        |

### Platform hardening

- HTTPS only; HSTS, strict CORS allow-list, security headers on the API and web.
- Request body size limit (for example 256 KB) and a maximum secrets size per environment.
- Rate limits on auth, token and write routes.
- Every read and write of secrets goes to the audit log (who, what, when, IP, client).
- Write `docs/threat-model.md` in Phase 1 and update it whenever the design changes.

## Data model

Ten Postgres tables; every secret-bearing column is ciphertext or a wrapped key, never plaintext. All tables have `id` (UUIDv7) and `created_at` unless noted.

| Table            | Key columns                                                                                                             | Notes                                                                                         |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| users            | email, name, github_id, public_key, encrypted_private_key, kdf_salt, kdf_params (jsonb), recovery_encrypted_private_key | One row per person. Keys are base64 strings                                                   |
| sessions         | user_id, refresh_token_hash, device_name, client (cli or web), expires_at, revoked_at, last_used_at                     | Lets users see and revoke devices                                                             |
| projects         | name, slug (unique per owner), owner_id                                                                                 |                                                                                               |
| members          | project_id, user_id, role (owner, admin, member, viewer), status (pending, active)                                      | Unique on (project_id, user_id). pending = joined but keys not yet granted                    |
| invites          | project_id, email, role, invited_by, token_hash, expires_at, accepted_at                                                | Email-based invite links                                                                      |
| environments     | project_id, name, is_shared, is_protected, current_key_version                                                          | is_shared = the shared layer. is_protected = needs confirmation (production)                  |
| environment_keys | environment_id, key_version, recipient_type (user or token), recipient_id, wrapped_key, created_by                      | One row per recipient per key version                                                         |
| secret_versions  | environment_id, version, key_version, ciphertext, nonce, author_id, message (optional)                                  | Append-only. Unique on (environment_id, version). Rollback = push an old version as a new one |
| service_tokens   | project_id, environment_id, name, token_id_hash, public_key, expires_at, last_used_at, revoked_at                       | Read-only, one environment each                                                               |
| audit_log        | project_id, actor_type, actor_id, action, target_type, target_id, metadata (jsonb), ip, user_agent                      | Append-only; never contains secret values                                                     |

### Rules

- `secret_versions` and `audit_log` are append-only: no UPDATE or DELETE in repository code.
- Deleting a project soft-deletes it (`deleted_at`) and hard-deletes after 30 days by a scheduled job (later phase).
- Indexes: every foreign key, plus `(environment_id, version desc)` and `(project_id, created_at desc)` on the audit log.
- Migrations are generated by drizzle-kit, reviewed by hand and committed. Never edit an applied migration.

## API design

A versioned REST API under `/v1`, one Elysia plugin per module, with the app's type exported for Eden Treaty.

### Conventions

- JSON in and out. Binary values (keys, ciphertext, nonces) are base64url strings.
- Auth: `Authorization: Bearer <access JWT>` for users, `Authorization: Bearer envy_…` for service tokens. A shared `authGuard` plugin resolves the actor and puts it on the context.
- Permissions are checked in services with one helper: `assertRole(actor, projectId, 'admin')`.
- Optimistic concurrency: pushing secrets sends `baseVersion`. If another push happened since, the API returns `409 VERSION_CONFLICT` with the latest version number, so the CLI can show a diff and ask.
- Lists use cursor pagination: `?cursor=…&limit=50`, response `{ items, nextCursor }`.
- No Swagger or OpenAPI docs: the Eden Treaty types are the API contract. Add them later only if a non-TypeScript client needs the API.
- Health check at `/health` (no auth).

### Endpoints

| Method and path                                         | Purpose                                                              | Who                    |
| ------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------- |
| POST /v1/auth/github/device                             | Start GitHub device flow for the CLI                                 | Anyone                 |
| POST /v1/auth/github/device/poll                        | Finish device flow, return tokens                                    | Anyone                 |
| GET /v1/auth/github/callback                            | Web OAuth callback                                                   | Anyone                 |
| POST /v1/auth/refresh                                   | Rotate refresh token, new access token                               | Session holder         |
| POST /v1/auth/logout                                    | Revoke current session                                               | User                   |
| GET /v1/me                                              | Profile + encrypted key material                                     | User                   |
| PUT /v1/me/keys                                         | Store keypair, encrypted private key, KDF params (first setup)       | User                   |
| GET /v1/me/sessions, DELETE /v1/me/sessions/:id         | List and revoke devices                                              | User                   |
| GET /v1/projects, POST /v1/projects                     | List and create projects                                             | User                   |
| GET/PATCH/DELETE /v1/projects/:id                       | Read, rename, delete                                                 | Member / admin / owner |
| GET/POST /v1/projects/:id/environments                  | List and create environments (with initial wrapped keys)             | Member / admin         |
| GET /v1/environments/:id/key                            | The caller's wrapped key for the current version                     | Member or token        |
| GET /v1/environments/:id/secrets                        | Latest (or `?version=n`) encrypted blob                              | Member or token        |
| POST /v1/environments/:id/secrets                       | Push a new version (baseVersion, ciphertext, nonce, keyVersion)      | Member                 |
| GET /v1/environments/:id/versions                       | Version history (metadata only)                                      | Member                 |
| POST /v1/environments/:id/rotate                        | New key version: re-encrypted blob + wrapped keys for all recipients | Admin                  |
| GET/POST /v1/projects/:id/members                       | List members (with public keys and fingerprints), invite by email    | Member / admin         |
| POST /v1/members/:id/grant                              | Upload wrapped env keys for a pending member                         | Admin                  |
| PATCH/DELETE /v1/members/:id                            | Change role, remove                                                  | Admin                  |
| POST /v1/invites/:token/accept                          | Accept invite                                                        | Invitee                |
| GET/POST /v1/projects/:id/tokens, DELETE /v1/tokens/:id | Service tokens                                                       | Admin                  |
| GET /v1/projects/:id/audit                              | Audit log                                                            | Admin                  |

### Eden Treaty setup

- `apps/api/src/app.ts` exports `export type App = typeof app`.
- `apps/cli/src/core/api.ts` and `apps/web/lib/api.ts` create `treaty<App>(baseUrl, { headers })`. A small wrapper adds the access token, refreshes it on 401, and turns error responses into `AppError` with the shared codes.
- No hand-written `fetch` calls to the API anywhere.

## CLI UX spec

The CLI should never make the user copy, paste or configure anything that it can work out itself.

### Commands

| Command                                                  | What it does                                                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `envy`                                                   | No args: interactive menu of common actions for the current folder                                                    |
| `envy login` / `envy logout`                             | Device flow in the browser, then master password (first time: set it and show the recovery key)                       |
| `envy init`                                              | Link the folder to a project (pick or create), import existing `.env*` files, write `.envy.json`, update `.gitignore` |
| `envy run -- <cmd>`                                      | Fetch, decrypt, merge shared + environment, then run the command with the variables injected. No file on disk         |
| `envy pull`                                              | Write `.env` (or the file in `.envy.json`), print a keys-only diff                                                    |
| `envy push`                                              | Read the local file, show a keys-only diff, confirm, upload as a new version                                          |
| `envy set KEY=value` / `envy unset KEY` / `envy get KEY` | Quick edits without a file                                                                                            |
| `envy use <env>`                                         | Set the default environment for this folder                                                                           |
| `envy env ls / add / rm`                                 | Manage environments                                                                                                   |
| `envy history` / `envy rollback <version>`               | Version list and restore                                                                                              |
| `envy members ls / invite / grant / rm / role`           | Team management with key fingerprints                                                                                 |
| `envy token create / ls / revoke`                        | Service tokens for CI                                                                                                 |
| `envy doctor`                                            | Check login, project link, gitignore, keychain, server reachability, missing keys                                     |
| `envy completion <shell>`                                | Shell completion for bash, zsh, fish                                                                                  |

### Project link file: `.envy.json` (committed)

```json
{
  "$schema": "https://envy.dev/schema/v1.json",
  "projectId": "01J…",
  "defaultEnvironment": "development",
  "file": ".env",
  "branches": { "staging": "staging" }
}
```

It holds no secrets. A teammate who clones the repo can run `envy pull` straight away.

### Choosing the environment

In priority order: `--env` flag, `ENVY_ENV` variable, the `branches` mapping for the current git branch, `defaultEnvironment`. Protected environments (production) are never picked automatically; they need `--env production` and a confirmation, or `--yes` in CI.

### Local storage

- Session tokens and the unlocked private key: OS keychain. If the keychain library does not work with `bun build --compile` on a platform, fall back to `~/.config/envy/credentials` with 0600 permissions encrypted by a key in the keychain or, last resort, the master password. Phase 0 includes a spike to decide this.
- Non-secret settings: `~/.config/envy/config.json` (API URL, last user).

### Output rules

- Every command finishes with one clear line: what happened, and the next step if any (`✔ Pulled 14 variables from development → .env`).
- Diffs show key names only: `+ STRIPE_KEY  ~ DATABASE_URL  − OLD_FLAG`. Values are never printed unless `envy get` is used.
- Errors say what went wrong and how to fix it: `✖ Not linked to a project. Run envy init.` Each shared error code maps to a fix message in `apps/cli/src/ui/errors.ts`.
- Spinners for anything over 300 ms. Colour respects `NO_COLOR`. `--json` gives machine-readable output on every read command.
- Non-interactive mode is detected (`CI=true` or no TTY): no prompts, fail with a clear message if input is needed.
- Exit codes: 0 success, 1 user error, 2 auth error, 3 network or server error, or the child's exit code for `envy run`.

### Smart checks

- `envy run` and `envy pull` compare against `.env.example` if present and warn about missing keys before the app crashes.
- `envy push` warns if the local file has keys that look like they belong elsewhere (for example a production URL in development) — later phase.
- After login, if the user is an admin and members are pending, the CLI asks once: `2 people are waiting for access to my-app. Grant now? (Y/n)`.

## Phased roadmap

Eight phases; after Phase 4 a single developer can already sync secrets end to end, and each later phase adds one capability on top. Give the agent one phase at a time.

### Phase 0 — Foundation

Goal: an empty but fully wired monorepo where `bun run verify` passes.

- [x] Bun workspaces with apps/api, apps/cli, apps/web, packages/crypto, packages/shared, packages/tsconfig
- [x] Pin Bun 1.4.4 or newer (packageManager field + setup-bun version in CI)
- [x] Strict base tsconfig; lint config with type-aware rules such as `no-floating-promises` and `no-explicit-any` set to error (oxlint, see ADR 0003)
- [x] Root scripts: dev, verify (format check, lint, `bun check`, `bun test`), test, build, db:generate, db:migrate
- [x] docker-compose.yml with Postgres 16
- [x] Pre-commit hook: `bun fmt` + lint on staged files
- [x] GitHub Actions workflow running `bun run verify`
- [x] AGENTS.md, docs/PLAN.md, docs/adr/0001-stack.md
- [x] Spike: confirm libsodium-wrappers-sumo and the chosen keychain library both work inside a `bun build --compile` binary on macOS and Linux. Write the result as ADR 0002 (Linux arm64 confirmed; macOS still to be confirmed before Phase 4 ends)

Done when: fresh clone → `bun install && docker compose up -d && bun run verify` passes with no errors, CI is green, and there is no ESLint, Prettier, Biome or typescript CLI dependency.

#### Phase 0 summary (2026-11-22)

Built:

- Bun 1.4.5 workspaces: `apps/api` (Elysia with `GET /health` and `type App`), `apps/cli` (placeholder binary), `apps/web` (placeholder static Next.js page), `packages/crypto`, `packages/shared`, `packages/tsconfig`.
- `bun run verify` = `bun fmt --check`, oxlint (type-aware), `bun check -b`, `bun test`. `bun run build` compiles the CLI and API binaries and exports the web site.
- Docker Compose with Postgres 16, drizzle-kit wired to `db:generate` and `db:migrate`.
- Pre-commit hook in `.githooks/`, installed by `bun install`.
- GitHub Actions: verify and migrations on every PR, binaries on `main`.
- AGENTS.md, docs/architecture.md, ADRs 0001 to 0004.

Changed from the plan (each has an ADR):

- `bun lint` is not in a stable Bun release yet, so linting uses oxlint for now (ADR 0003).
- `next build` needs the `typescript` package, so it is a dev dependency of `apps/web` only (ADR 0004).
- Keychain: `@napi-rs/keyring`, because `Bun.secrets` does not work on Linux machines without libsecret (ADR 0002).
- `docker-compose.yml` takes `ENVY_POSTGRES_PORT`, for machines that already run Postgres on 5432. Mailpit is left for the phase that sends email.

Open questions:

- macOS check of the spike (ADR 0002) needs a Mac.
- CI passed on the first run (PR #1).

### Phase 1 — Crypto package

Goal: `packages/crypto` implements every function in the Security section, fully tested, with no I/O.

- [x] Lazy libsodium init helper (`await ready()`)
- [x] Master key derivation with stored KDF params
- [x] User keypair, private key encrypt/decrypt, recovery key
- [x] Env key generate, wrap, unwrap
- [x] Secrets encrypt/decrypt with AAD and format version byte
- [x] Key fingerprint (short, human-comparable)
- [x] Dotenv parser and serializer in `packages/shared` (quotes, multiline, comments, export prefix) with round-trip tests
- [x] docs/threat-model.md

Done when: tests cover round trips, wrong key, wrong AAD, tampered ciphertext, tampered nonce and old format versions — all fail safely with typed errors. No function logs anything.

#### Phase 1 summary (2026-11-22)

Built:

- `packages/crypto`: every function from the Security section, plus `generateSalt`, `getPublicKey`, `parseRecoveryKey`, `clearKey` and base64url helpers. 40 tests cover round trips, wrong keys, wrong AAD (swapped project, environment, version, key version), tampered ciphertext and nonces, unknown format versions, fixed version 1 test vectors, and a check that nothing is logged.
- `packages/shared`: `.env` parser and writer with a fixture file and round-trip tests (fixture, awkward values, random values).
- `docs/threat-model.md`, ADR 0005 (crypto details).

Skipped: nothing.

Open questions: none.

### Phase 2 — API core: auth and users

Goal: a user can sign in with GitHub from the CLI or web and store their key material.

- [x] `config.ts` validating env vars; app fails fast on bad config
- [x] Drizzle setup, users and sessions tables, first migration
- [x] AppError, error handler plugin, logger with redaction, request IDs
- [x] GitHub device flow + web callback; access JWT + rotating refresh token
- [x] authGuard plugin; /v1/me, /v1/me/keys, sessions list and revoke
- [x] Rate limiting on auth routes
- [x] Export `type App`, used by the Eden client in the CLI and web

Done when: integration tests (real Postgres) cover login, refresh rotation, reuse of an old refresh token revoking the session, and key upload. A small Eden client test calls every route with full types.

#### Phase 2 summary (2026-11-22)

Built:

- `config.ts` (fails fast with every problem listed), Drizzle `users` and `sessions` tables with the first migration.
- `AppError`, one error handler with the shared error shape, request ids, a logger that redacts sensitive field names, per-IP rate limits on the auth routes.
- GitHub device flow (CLI) and redirect flow (web, with a state cookie), 15-minute access JWTs, 30-day refresh tokens that rotate on every use; reusing an old one ends the session.
- `authGuard`, `/v1/me`, `/v1/me/keys` (first setup only, sizes checked), `/v1/me/sessions` list and revoke, `/v1/auth/logout`.
- `type App` used by typed Eden clients in `apps/cli/src/core/api.ts` and `apps/web/lib/api.ts`.
- Integration tests against real Postgres (one new database per test file, fake GitHub, controllable clock): device and web sign-in, refresh rotation, reuse revoking the session, expiry, logout, session revoke, rate limit, key upload and validation. An Eden test calls every route with full types.

Changed from the plan (ADR 0006): `jose` instead of `@elysiajs/jwt`; an extra `GET /v1/auth/github/login` route to start web sign-in; sessions list is not paginated.

Open questions: concurrent refreshes from two CLI processes end the session (no grace window). Phase 4 must refresh under a lock.

### Phase 3 — API: projects, environments, secrets

Goal: the API can store and serve encrypted secrets with history.

- [x] Tables: projects, members, environments, environment_keys, secret_versions, audit_log
- [x] Modules: projects, environments, secrets, audit (routes, service, repository, schema each)
- [x] Creating a project also creates shared, development, staging, production (production protected), with the owner's wrapped keys sent by the client
- [x] Push with baseVersion and 409 VERSION_CONFLICT
- [x] Version history and fetch by version
- [x] Audit entries for every secret read and write

Done when: integration tests prove a non-member gets 404 (not 403, to avoid leaking existence), conflicting pushes get 409, and no route ever accepts or returns plaintext.

#### Phase 3 summary (2026-11-22)

Built:

- Tables `projects`, `members`, `environments`, `environment_keys`, `secret_versions`, `audit_log` with indexes on every foreign key, `(environment_id, version desc)` and `(project_id, created_at desc)`.
- Modules `projects`, `environments`, `secrets`, `audit` (routes, service, repository, schema), plus a `members` repository and one access checker for roles.
- Project creation makes shared, development, staging and protected production with the owner's wrapped keys; extra environments need a key for every active member.
- Push with `baseVersion`, 409 `VERSION_CONFLICT` with `latestVersion` (also when two pushes race), fetch by version, paged history, audit entries for every secret read and write, admin-only audit list, soft delete.
- Integration tests: non-members get 404 on every project and environment route, conflicting and racing pushes get 409, a real client round trip decrypts every version, and a marker value never appears in any request, response or database row.

Moved: `POST /v1/environments/:id/rotate` to Phase 5, where member removal needs it (ADR 0007).

Open questions: none.

### Phase 4 — CLI core

Goal: one developer can go from zero to `envy run` in under a minute.

- [x] Command framework, output helpers, error-to-fix mapping, exit codes
- [x] Typed API client wrapper over Eden with auto refresh
- [x] Keystore (keychain with fallback from the Phase 0 spike)
- [x] login (device flow + master password setup or unlock + recovery key display), logout
- [x] init (pick or create project, detect and import `.env*`, write `.envy.json`, update `.gitignore`)
- [x] Environment resolver (flag, env var, branch map, default; protected confirmation)
- [x] pull, push (keys-only diff, conflict handling), run (inject, forward signals, pass exit code)
- [x] set, unset, get, use
- [x] `bun build --compile` script for the current platform

Done when: an end-to-end test spawns the compiled binary against a test API and covers login (mocked GitHub), init with import, push, pull, run and a conflicting push. Manual check: the whole first-run flow needs no copy-paste.

#### Phase 4 summary (2026-11-22)

Built:

- Command framework (commander) with exit codes 0/1/2/3 (or the child's code for `run`), output helpers that respect `NO_COLOR`, a fix message for every shared API error code, prompts that fail with a clear hint when there is no terminal, keys-only diffs.
- Eden client wrapper that refreshes the access token under a file lock and retries once on an expired token.
- Keystore: OS keychain (`@napi-rs/keyring`), falling back to a `0600` file that never holds the private key.
- `login` (device flow, master password set-up with recovery key, or unlock), `logout`, `init` (pick or create a project, import `.env*`, write `.envy.json`, update `.gitignore`), environment resolver, `pull`, `push` (conflict handling), `run` (signals, exit code), `set`, `unset`, `get`, `use`.
- `bun run --filter @envy/cli build` compiles a single binary.
- End-to-end test: builds the binary and runs it against a real API (fake GitHub) through login, init with import, pull, push, run, a second machine unlocking, a conflicting push and `--force`, protected environments and error exit codes. Unit tests for the resolver, shared-layer push, `.gitignore`, `.envy.json` and the file keystore.

Decisions: ADR 0008 (environment variables, keystore fallback, shared layer on push, conflict rules, protected environments).

Open questions:

- The manual first-run check against real GitHub still needs a GitHub OAuth app with device flow enabled. The only thing the user types is the short code GitHub asks for.
- The macOS keychain check from ADR 0002 is still open.

### Phase 5 — Teams and access

Goal: a team can share a project safely.

- [x] invites table; invite by email (link printed by the CLI; email sending later)
- [x] Pending members and grant flow; CLI prompt for admins after login
- [x] Roles: owner, admin, member, viewer (viewer = pull only, no push)
- [x] Remove member → key rotation for every environment they could read + reminder to rotate real credentials
- [x] Key fingerprints in `envy members ls` and on invite acceptance
- [x] history and rollback

Done when: tests show a removed member cannot decrypt any version pushed after removal, a viewer cannot push, and rotation keeps every remaining member able to pull.

#### Phase 5 summary (2026-11-22)

Built:

- `invites` table; `POST /v1/projects/:id/members` (invite by email, link printed by the CLI), `POST /v1/invites/:token/accept`, `GET /v1/projects/:id/members` (public keys), `POST /v1/members/:id/grant`, `PATCH` and `DELETE /v1/members/:id`, `POST /v1/environments/:id/rotate`.
- Pending members get nothing until granted; admins are asked once after `envy login` to grant waiting people.
- Roles: owner, admin, member, viewer (viewer = pull only); the owner cannot be changed or removed.
- Removing an active member rotates every environment key in the same transaction, and the CLI reminds the admin to change the real credentials.
- Client-side fingerprints in `envy members ls`, `envy members grant` and `envy accept`.
- `envy history`, `envy rollback <version>`, `envy members ls/invite/grant/rm/role`, `envy accept <link>`.
- Tests: a removed member's kept key fails to decrypt every version written after removal (and the API gives them 404), a viewer cannot push, remaining members still pull after rotation, invite rules (one use, email match, expiry), and an end-to-end CLI run of invite → accept → grant → history → rollback → remove.

Decisions: ADR 0009.

Open questions: none.

### Phase 6 — Web dashboard

Goal: everything except `run` can be done in the browser.

Static export rules: `output: "export"` in next.config; all data fetched on the client through Eden; no Next API routes, server actions, middleware or default image optimization; pages with IDs use query parameters (`/project?id=…`) because IDs are unknown at build time. The refresh token is an httpOnly cookie set by the API; the access token stays in memory.

- [x] GitHub login, master password unlock (key kept in memory only, cleared on tab close or after 15 minutes idle)
- [x] Projects list, environment tabs, secret table editor with reveal-on-click and copy
- [x] Version history with keys-only diff and rollback
- [x] Members page with invite, grant, role change, remove
- [x] Audit log page, sessions and devices page (tokens page moved to Phase 7, with the tokens API)
- [x] Empty, loading and error states on every page; keyboard accessible

Done when: a blob written by the web decrypts in the CLI and the reverse (shared crypto test), and no plaintext appears in network requests (checked in a Playwright test).

#### Phase 6 summary (2026-11-22)

Built:

- Static Next.js dashboard with shadcn/ui (set up with its CLI), Tailwind v4 and system light/dark mode.
- GitHub sign-in, master password set-up (recovery key shown once) and unlock; the key lives only in memory and is wiped on lock, after 15 minutes idle and on leaving the page.
- Projects list (with "waiting for access" counts) and project creation; environment tabs; secret editor with reveal-on-click, copy, add, remove, keys-only confirmation and conflict message; history with keys-only comparison and rollback.
- Members page (fingerprints, invite link, grant after fingerprint check, role change, remove with key rotation), audit log with paging, signed-in devices with sign-out, invite acceptance page, sign-in error page.
- Loading, empty and error states on every page; labelled controls, native focus handling from Radix dialogs.
- Browser test (Playwright): a secret saved in the browser decrypts in the CLI and one set in the CLI shows in the browser; no request or response contains either value or the master password.

Moved: the service tokens page, to Phase 7 with the tokens API (ADR 0010).

Open questions: none.

### Phase 7 — CI tokens and polish

Goal: Envy works in CI and feels finished.

- [x] Service tokens (create, list, revoke) in CLI and web; `ENVY_TOKEN` support in run and pull
- [x] Tokens page in the dashboard (moved from Phase 6)
- [x] `envy doctor`, `envy completion`, interactive `envy` menu
- [x] `.env.example` missing-key warnings
- [x] `--json` on all read commands; `NO_COLOR` and non-TTY behaviour
- [x] Example GitHub Actions snippet in the README

Done when: a sample repo's GitHub Actions job runs `envy run -- bun test` using only `ENVY_TOKEN`, and the token cannot push or read other environments.

#### Phase 7 summary (2026-11-22)

Built:

- `service_tokens` table; `POST/GET /v1/projects/:id/tokens`, `DELETE /v1/tokens/:id`, `GET /v1/tokens/current`; `envy_` bearer authentication; tokens read one environment only and are refused everything else; key rotations re-wrap for active tokens.
- `envy token create/ls/revoke`, `ENVY_TOKEN` for `run`, `pull` and `get` (no login, no `.envy.json`), and a Service tokens page in the dashboard.
- `envy doctor`, `envy completion bash|zsh|fish`, an interactive `envy` menu, `envy env ls/add`, `--json` on read commands, `.env.example` missing-key warnings; colour follows `NO_COLOR` and terminals only.
- GitHub Actions example in the README.
- End-to-end test: a machine with only `ENVY_TOKEN` runs `envy run` with the development secrets; the token cannot push, set or read staging; removing a member keeps it working; revoking stops it at once.

Decisions: ADR 0011 (only the token id is ever sent; tokens skip the shared layer).

Open questions:

- The "sample repo on GitHub Actions" check is simulated in the end-to-end test; a real run needs a deployed API (Phase 8).
- `envy env rm` needs an API route for deleting environments.

### Phase 8 — Hardening and release

Goal: safe to give to other people.

- [x] Security headers, CORS allow-list, body size limits, rate limits on all write routes
- [x] Dependency audit; review of every place secrets touch memory, logs and errors
- [x] Cross-platform binaries (macOS arm64/x64, Linux arm64/x64, Windows x64) with checksums
- [x] Install script (`curl … | sh`) that verifies the checksum
- [ ] Deploy API and web through Shipyard (envy database for appuser on the existing Postgres, migrations as a release step, static web build), plus nightly backups
- [x] README, docs site page for each command, CHANGELOG

Done when: a new user on a clean machine can install, sign up, init, invite a teammate and run their app by following only the README.

#### Phase 8 summary (2026-11-22)

Built:

- Security headers on every API response (HSTS in production), CORS limited to `WEB_URL`, 256 KiB body limit, rate limits on every write per IP and per user or token.
- `bun audit` (two moderate advisories, both in development-only tools) and a written review of every place secrets touch memory, logs, errors and the network: `docs/security-review.md`.
- Release workflow: native builds for Linux x64/arm64, macOS arm64/x64 and Windows x64, each smoke-tested including the OS keychain, published with `checksums.txt` on `v*` tags; the default API URL is baked in from a repository variable.
- `scripts/install.sh` (checksum-verified, tested against a fake release, shellcheck-clean) and `envy upgrade`.
- `docs/deploy.md` (Shipyard commands, database, environment variables, web headers, backups and restore test), a page per command in `docs/commands/`, `CHANGELOG.md`, and a README that walks a new user through install, sign-up, init, invite and run.

Not done (needs the owner):

- [ ] Deploy the API and web through Shipyard, create the `envy` database for `appuser`, and set up the nightly backup cron (`docs/deploy.md`).
- [ ] Set the `ENVY_API_URL` repository variable, make releases public, and tag `v0.1.0`.
- [ ] Run the final check: a new user on a clean machine follows only the README.

### Phase 9 — Monorepo apps

Goal: one repo with many apps and packages, each with its own `.env`, managed from the root or from each app's folder (ADR 0018).

- [x] ADR 0018: apps inside a project, three layers (shared → root stage → app stage), stages kept in sync
- [x] API: `apps` table and module, app environments, app-aware environment list (`?apps=true`), new stages for every app at once
- [x] API: all-or-nothing push to several environments; service tokens that read the layers under their environment
- [x] Shared: merge and separate any number of layers
- [x] CLI: `apps` in `.envy.json`, pick the app from the current folder, `--app`; pull, push, run, get, set, unset, history and rollback per app; root pull and push across every app
- [x] CLI: `envy apps ls|add|rm`, `envy env add` for every app, grants, removals and tokens that cover apps
- [x] CLI: `envy init` finds workspace folders and imports each one's files
- [x] Web: app picker on the project page, app environments in grants, removals and tokens, audit labels
- [x] End-to-end test against a sample monorepo; docs

Done when: in a monorepo with `apps/api` and `apps/web`, `envy init` at the root links both, `envy pull` at the root writes each app's file, `cd apps/web && envy run -- <cmd>` gets shared, root and web values, and a token for `web/production` gives CI the same values.

#### Phase 9 summary (2026-11-26)

Built:

- API: `apps` module (list, create with one environment per root stage, soft remove that revokes the app's tokens); app environments are ordinary environments with `app_id`, so keys, rotation, grants and history are unchanged. New stages go to every app in the same request. `POST /v1/projects/:id/secrets` pushes several environments all or nothing. Service tokens can hold keys for the layers under their environment; rotations re-wrap for them.
- Shared: `layersUnder`, `mergeLayers`, `separateFromLayers`, used by the API, CLI and web.
- CLI: `apps` in `.envy.json` (paths checked like `file`), targets picked from the folder or `--app`, root `pull`/`push` across every app (`--all` from inside an app), `envy apps ls|add|rm`, `envy init` workspace detection (`package.json`, `pnpm-workspace.yaml`, folders with `.env` files), `envy env add` for every app, tokens with layers.
- Web: app picker that keeps the stage, app names in tokens, token layers, removals that cover layer tokens, audit labels.
- Tests: API integration (apps, stage sync, batch push, token layers, removal), CLI unit (targets, link parsing, workspaces, layers), a compiled-binary monorepo end-to-end test, and a browser test of the app picker.

Not done:

- Per-app access (a member who sees only one app): needs app-level membership.
- Renaming an app: remove and add it again for now.

Open question: none.

### Phase 10 — Project lifecycle and access

Goal: owners can delete projects, admins can limit a member to some environments, and the shared layer explains itself. One PR per feature.

- [x] Delete and restore projects: owner only, restorable for 30 days, purged daily by the API; `envy projects ls|rm|restore`; dashboard project Settings (rename, delete) and Recently deleted
- [x] Shared layer, explained: "Shared (all)" tab, a line saying what it does, inherited values shown in each environment
- [ ] Access per environment (ADR 0019): a member gets every stage or only some; keys only for those; server refuses the rest; CLI and dashboard to change it

## Testing, CI and release

Tests are written with each task, not after; but only where they protect real behaviour.

### What to test, and what not to

- Test what could actually break or cost something if it broke: crypto, permissions, version conflicts, key rotation, the dotenv parser, CLI flows a user depends on, and every bug that gets fixed (one test that reproduces it).
- Do not write tests that only repeat the code or what TypeScript and the libraries already guarantee: getters, simple mappers, constants, "returns an object", that Elysia validates a schema, or that Drizzle saves a row.
- One clear test per behaviour, not many near-copies. Prefer a few tests through the real route or command over many tiny unit tests of internals.
- If a test would break on every harmless refactor, it is testing the wrong thing.
- Crypto is the exception where thoroughness matters: every failure path stays tested.

| Layer           | What to test                                         | How                                                                                       |
| --------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| packages/crypto | Round trips, every failure path, cross-version reads | `bun test`, pure unit tests; aim for full coverage of exported functions                  |
| packages/shared | Dotenv parse/serialize edge cases, error codes       | Unit tests with fixture files                                                             |
| API services    | Business rules and permissions                       | Unit tests with fake repositories                                                         |
| API routes      | Real HTTP + real Postgres                            | Integration tests; each test file gets a fresh schema or transaction rollback             |
| CLI             | Commands end to end                                  | Spawn the compiled binary against a test API with a temp home dir and temp project folder |
| Web             | Main flows, no plaintext on the network              | Playwright                                                                                |

### CI (GitHub Actions)

- On every PR: install with cache, then `bun run verify` (format check, lint, `bun check`, unit tests), then integration tests with a Postgres service container.
- On main: same, plus build the CLI binary and the API binary.
- On a version tag (`v*`): build binaries for all platforms, generate checksums, create a GitHub Release with the CLI binaries only. API and web are deployed separately through Shipyard.

## Environments and deploy

The API and web are deployed by the owner's own platform, Shipyard, on the owner's server; only the CLI is published as a release. No third-party hosting or database services.

### Local development

- Point `DATABASE_URL` at any Postgres: the existing server's dev database, a local install, or the optional Docker Compose file.
- API on localhost:3000, web on localhost:3001.

### Database (existing Postgres server)

- Create a database `envy` on the existing Postgres, owned by (or fully granted to) the existing role `appuser`. Do not create new database roles.
- Optional second database `envy_staging`, also for `appuser`.
- Postgres stays private: never open port 5432 to the internet. Require SSL if the API connects over a network.
- Migrations run with drizzle-kit (`bun run db:migrate`) as a release step before the new API version starts.

### What Shipyard deploys

- **API:** build command `bun install && bun run --filter api build`, start command runs the built server. Reads `PORT` and all config from environment variables, fails fast if any are missing. Health check at `/health`. Release step: `bun run db:migrate`. Logs to stdout as JSON lines.
- **Web:** Next.js static export (`output: "export"`). Build command produces plain files in `apps/web/out`; Shipyard serves them as a static site. The API URL is set at build time with `NEXT_PUBLIC_API_URL`.
- Put the exact build, start and release commands in `docs/deploy.md`, and add whatever config file Shipyard expects once the owner shares its format. Do not add Dockerfiles, systemd units or deploy scripts unless asked.
- Serve web and API on the same site (for example `app.<domain>` and `api.<domain>`) so auth cookies work with `SameSite=Lax`.

### CLI releases

- The CLI is the only thing released: compiled binaries for each platform plus a `checksums.txt`, attached to a GitHub Release on each `v*` tag.
- The install script downloads the right binary for the machine and verifies its checksum.
- `envy --version` and `envy upgrade` read the latest release.

### Backups and monitoring

- Nightly `pg_dump` of `envy` by cron, kept 14 days, copied to a second disk or machine you control. Test a restore once a month.
- API logs to stdout; Shipyard collects them. Never log secret material (see the redaction rule).
- Uptime: Shipyard's health check on `/health`, or a cron job that calls it and alerts by email or a webhook you choose.

## Future extensions

The module pattern means each of these is a new module or command, not a rewrite.

- **Secret references** — `DATABASE_URL=${shared.DB_HOST}/app` resolved at pull time.
- **Approvals for production** — a push to a protected environment waits for a second admin.
- **Per-key access** — hide some keys from some roles (needs per-key encryption).
- **Imports** — from Vercel, Doppler, Infisical, Heroku and plain `.env` folders.
- **Integrations** — VS Code extension, Docker and Kubernetes injection, webhooks on change.
- **Email login and SSO** — magic links, Google, SAML for companies.
- **Self-hosting** — one Docker Compose file with API, web and Postgres.
- **MCP server** — let AI agents read key names and request scoped, temporary access.

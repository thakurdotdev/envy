# ADR 0010: Web dashboard

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 6 builds the dashboard: everything except `envy run`, in the browser,
as a static Next.js export.

## Decision

- **UI components come from shadcn/ui**, set up with its CLI
  (`components.json`, style `radix-nova`, Radix primitives, Tailwind v4,
  lucide icons, `sonner` for toasts, `next-themes` for system light/dark).
  Files in `components/ui` are generated; add more with
  `bunx shadcn@4.23.0 add <name>` instead of writing them by hand. The one lint
  rule they break (`no-unsafe-type-assertion`) is switched off for that folder
  only. The generated `lib/utils.ts` re-exports `cn` from the `cn` package.
- **The font is Geist through `next/font/google`**, which downloads it at build
  time, so the web build needs internet access.
- **Static export rules from the plan:** client-only pages, IDs in the query
  string (`/project?id=…`, `/members?id=…`, `/audit?id=…`, `/invite?token=…`),
  no Next API routes, server actions, middleware or image optimizer.
- **Tokens:** the refresh token stays in the API's httpOnly cookie; the access
  token is a module variable, never in storage. Refreshes go through the Web
  Locks API so two tabs never present the same refresh token (which would end
  the session, ADR 0006).
- **The private key lives only in React state**, is wiped with
  `sodium.memzero` on lock, after 15 minutes without input, and on `pagehide`.
  A reload therefore asks for the master password again.
- **First sign-in in the browser** sets the master password and shows the
  recovery key once, behind an "I have saved it" checkbox, like `envy login`.
- **The browser's crypto operations (`lib/envy.ts`) mirror the CLI's**
  (`core/secrets.ts`, `core/team.ts`). Both call only `packages/crypto`. They
  are not shared yet because a shared package could not import the API's
  types without packages depending on apps; revisit if they grow apart.
- **The service tokens page moves to Phase 7**, where the tokens API is built.
- **Browser test:** builds the real site and CLI, serves the site from a tiny
  static server that also plays github.com (it sends the browser straight back
  to the callback), signs in, creates a project, saves a secret, has the CLI
  read it and write another one, has the browser read that, and checks that no
  request or response contains either value or the master password. It uses
  the `playwright` library inside `bun test`; CI installs Chromium first.

## Consequences

- `bun run verify` needs Chromium locally: `cd apps/web && bunx playwright install chromium`.

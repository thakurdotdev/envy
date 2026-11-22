# ADR 0004: `typescript` package in apps/web for Next.js

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 0 asks for no `typescript` CLI dependency, because `bun check` does type
checking. But `next build` refuses to build a TypeScript app unless the
`typescript` and `@types/node` packages are installed. Without them it tries
to install them itself, which fails in a Bun workspace.

## Decision

Add `typescript` and `@types/node` as dev dependencies of `apps/web` only.
They are there only because Next.js loads them during `next build`.

- No script calls `tsc`. `bun check -b` stays the only type checker.
- `next.config.ts` sets `typescript.ignoreBuildErrors`, so Next.js does not
  run a second, slower type check.

## Consequences

- Other packages must not depend on `typescript`.
- If Next.js stops needing the package, remove it and mark this ADR as
  replaced.

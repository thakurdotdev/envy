# ADR 0003: Lint with oxlint until `bun lint` is stable

- Status: Accepted
- Date: 2026-11-22

## Context

The plan uses `bun lint`, Bun's built-in linter. On 2026-11-22 it is not in
any stable Bun release (1.4.4 and 1.4.5 do not have it). It exists only in
canary builds (1.4.6-canary). Pinning a canary build would also mean building
the released CLI binary with a pre-release Bun.

## Decision

- Pin the latest stable Bun (1.4.5).
- Lint with oxlint plus `oxlint-tsgolint`, which adds the rules that need type
  information (for example `no-floating-promises`). Rules live in
  `.oxlintrc.json`. `no-explicit-any` and `no-floating-promises` are errors,
  and warnings also fail the run.
- `bun run lint` is the only way scripts, CI and the pre-commit hook call the
  linter, so switching later touches the `lint` script, the hook and this
  config only.

## Consequences

- Two dev dependencies (`oxlint`, `oxlint-tsgolint`) instead of none. Still no
  ESLint, Prettier or Biome.
- When `bun lint` ships in a stable release: upgrade Bun, move the rules into
  the `[lint]` section of `bunfig.toml` (`bun lint --init`), remove both
  packages, and mark this ADR as replaced.

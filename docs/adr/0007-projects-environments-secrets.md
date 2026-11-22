# ADR 0007: Projects, environments and secrets API

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 3 stores encrypted secrets with history. The plan sets the tables and
routes; these are the details it leaves open.

## Decision

- **The `members` table and the role check arrive now**, because every
  route needs "is this user a member, and with which role". Inviting,
  granting and removing members stay in Phase 5.
- **One access checker** (`lib/access.ts`): a non-member, a pending member
  or anyone asking about a deleted project gets 404 (`PROJECT_NOT_FOUND` or
  `ENVIRONMENT_NOT_FOUND`); a member with too low a role gets 403
  `FORBIDDEN`. Role order: viewer < member < admin < owner. Viewers can pull,
  members can push, admins create environments, rename and read the audit
  log, owners delete.
- **Writes run in one transaction with their audit entry** (`runInTransaction`
  gives services a set of repositories bound to the transaction).
- **Creating a project** takes the four starter environment keys, each
  wrapped for the owner on the client, keyed by environment name.
- **Creating another environment** must include a wrapped key for exactly
  the project's active members, or it is refused with `RECIPIENTS_MISMATCH`.
- **Push:** the client sends `baseVersion` and encrypts for
  `baseVersion + 1`, because the version number is part of the AAD. The
  server stores exactly that number; a stale base or a lost race (caught by
  the unique index) gives 409 `VERSION_CONFLICT` with
  `error.details.latestVersion`. A push with an old `keyVersion` gives 409
  `KEY_VERSION_OUTDATED`. Encrypted size is capped at 128 KiB.
- **Error bodies may carry `details`** (string or number values) next to
  `code` and `message`.
- **`GET /v1/environments/:id/secrets` returns `{ current: … | null }`**:
  null for an environment with no versions yet, 404 `VERSION_NOT_FOUND` only
  when a specific `?version=` does not exist.
- **`GET /v1/environments/:id/key` takes an optional `?keyVersion=`**, so a
  client can read an old version encrypted with an older key.
- **Cursors:** the cursor is the last item of the page (row id for projects
  and audit, version number for history); the next page starts after it.
- **The audit log records** `project.created`, `project.renamed`,
  `project.deleted`, `environment.created`, `secrets.read` and
  `secrets.pushed`, with IP and user agent. Reading a wrapped key is not
  logged on its own; reading the secrets it opens is.
- **Request bodies that carry key material reject unknown fields**, so a
  plaintext field sent by mistake is refused, not silently dropped.
- **Rotation (`POST /v1/environments/:id/rotate`) moves to Phase 5**, where
  removing a member needs it.

## Consequences

- Phase 5 adds invites and grants on top of `members` without changing the
  access checker.
- Service tokens (Phase 7) will be a second actor type in the same checker.

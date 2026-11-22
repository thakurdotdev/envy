# ADR 0009: Teams, invites and key rotation

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 5 lets a team share a project. The plan sets the flow (invite,
pending member, grant, remove with rotation); these are the details.

## Decision

- **Invites are tied to an email.** `POST /v1/projects/:id/members` makes a
  random token (only its SHA-256 is stored), valid for 7 days and one use.
  Only a user whose verified GitHub email matches can accept it, so a leaked
  link is useless to anyone else. The link is `WEB_URL/invite?token=…`; the
  CLI command is `envy accept <link>` (not in the plan's list, but needed).
  Invite tokens are hidden in request log paths.
- **Accepting needs keys set up** (`KEYS_NOT_SET` otherwise) and makes a
  pending member, who gets 404 on everything until granted.
- **Fingerprints are computed by clients only.** The API returns public keys,
  never fingerprints, because a server-made fingerprint would prove nothing.
  `envy accept` prints the invitee's own fingerprint; `envy members grant`
  prints the same code and asks the admin to compare it with the person.
- **Grant** must send one wrapped key per environment at its current key
  version. New members cannot read versions encrypted with older keys; an
  admin can roll back such a version, which re-encrypts it with the current key.
- **Removing an active member and rotating every environment is one request**
  (`DELETE /v1/members/:id` with `rotations`). The admin's client makes a new
  key per environment, wraps it for every remaining active member and
  re-encrypts the latest secrets as a new version. The server applies the
  removal and every rotation in one transaction, so there is never a moment
  when a removed member's key opens the newest data. Pending members have no
  keys, so removing them needs no rotations. `POST /v1/environments/:id/rotate`
  does the same for one environment without removing anyone.
- **Rotation checks:** the new key version must be the current one plus one
  (a conditional update stops two rotations at once), the wrapped keys must
  match the remaining active members exactly, and the re-encrypted version
  must be based on the latest version.
- **Roles:** admins invite, grant, change roles and remove; nobody can make,
  change or remove the owner through these routes.
- **The project list includes `pendingMembers` for admins**, so `envy login`
  can ask once: "2 people are waiting for access to my-app. Grant now?"
- **Rollback is client-side:** decrypt the old version and push it as the
  newest one with the current key (`Rollback to version n`).
- **Eden returns `Date` objects for ISO date strings** at runtime even though
  the types say `string`; clients read dates through `new Date(value)`.

## Consequences

- A malicious server can still swap a public key during an invite; comparing
  fingerprints in person is the defence (known v1 limit, see threat model).

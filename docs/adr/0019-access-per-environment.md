# ADR 0019: Access per environment

- Status: Accepted
- Date: 2026-11-26

## Context

Every active member got the key of every environment, so anyone who could
read development could also read production. Teams want to give a
contractor or a new hire development (and maybe staging) only.

## Decision

- **Each member has an access list**: `null` means every environment (the
  default, and what every existing member keeps), or a list of stage names
  such as `["development", "staging"]`. It is stored on `members` as
  `environment_access text[]`.
- **Access is by stage name.** It covers the root environment of that name
  and every app's environment of that name (ADR 0018). The `shared` layer is
  always included, because every stage is built on it.
- **Admins and owners always have every environment.** They rotate keys,
  grant members and re-encrypt secrets, which needs every key. Giving a
  restricted member the admin role is refused until their access is "all".
- **Keys follow access.** A member gets wrapped keys only for the
  environments they can read: when granted, when an environment or app is
  created (a restricted member is left out of a new stage), and when access
  changes. This is the real protection: without the key, a hacked server
  could not give them the secrets in readable form either.
- **The server enforces it too.** An environment a member cannot read is
  left out of their environment list, and reading its key, secrets or
  history gives `403 NO_ENVIRONMENT_ACCESS`. So does pushing to it.
- **Changing access** (`PUT /v1/members/:id/access`) sends, in one request,
  keys for the stages being added and a key rotation for each environment
  being taken away (wrapped for everyone who keeps it), so the member's
  old key no longer opens anything new.
- **Granting** a pending member can set their access in the same request
  (`access` in the grant body); the keys must then cover exactly those
  environments.
- **Removing a member** rotates exactly the environments they could read.
- Wrapped keys must cover exactly the members who can read an environment,
  everywhere this was "every active member" before (`RECIPIENTS_MISMATCH`
  otherwise).

## Consequences

- Clients decide recipients with one shared rule (`memberCanRead` in
  `packages/shared`), the same one the server uses.
- Older clients still work for projects where everyone has "all". In a
  project with a restricted member they are refused when they make keys,
  because they would wrap for too many people.
- Per-key access (hiding single variables) is still out of scope.

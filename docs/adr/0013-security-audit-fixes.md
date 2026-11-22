# ADR 0013: Fixes from the second security audit

- Status: Accepted
- Date: 2026-11-22

## Context

A second audit of the API, CLI, web dashboard and release pipeline (see
`docs/security-review.md`) found gaps that the Phase 8 review missed. The
most serious: a removed admin could keep reading new secrets through a
service token they had made, and a server could hand out an old secrets
version as the latest without any client noticing.

## Decision

**API**

- **Behind proxies, the client address is counted from the right of
  `X-Forwarded-For`,** not taken from the left. Each proxy appends the address
  it saw; everything before those comes from the client, who could otherwise
  dodge every per-IP rate limit by sending a new fake address each time.
  `TRUST_PROXY` is the number of proxies (2 for Cloudflare then nginx: the
  client is second from the right). It first shipped as "the last entry",
  which behind Cloudflare picked Cloudflare's edge and made users share limits.
- **Only the previous refresh token counts as reuse.** Sessions store the
  hash of the token they replaced (`previous_refresh_token_hash`). That token
  still ends the whole session (`REFRESH_TOKEN_REUSED`); any other wrong
  token is just `REFRESH_TOKEN_INVALID`, so knowing a session id is not
  enough to sign someone out. Refresh tokens whose session id is not a UUID
  are refused before reaching the database.
- **A cookie refresh must come from the dashboard:** `POST /v1/auth/refresh`
  without a body token needs `Origin` equal to `WEB_URL`. The CLI sends its
  token in the body and is not affected.
- **Removing a member revokes the service tokens they made** in that project
  and ends their unused invites, in the same transaction. They saw each full
  token once, and the rotation used to re-wrap the new key for those tokens,
  so a kept copy went on reading every new version. Wrapped keys an older
  client still sends for those tokens are dropped. `DELETE /v1/members/:id`
  now answers `200 { revokedTokens: [{ id, name, environmentName }] }`
  instead of `204`, so the CLI can say which CI tokens to make again.
- **`APP_ENV=production` requires `https://`** for `API_URL` and `WEB_URL`.

**CLI**

- **`trust.json`** in the config folder remembers (a) every teammate's and
  service token's public key the first time it is seen, and (b) the newest
  secrets version and key version seen per environment. A changed public key
  is refused before anything is wrapped for it (keys can never change in
  Envy, so a change means a swap). An older version, or new secrets asked to
  be encrypted with an older key version, is refused as a rollback. Deleting
  the file resets both, for example after a server is restored from backup.
- **`envy accept` shows the fingerprint of this machine's own key** and
  refuses if the server's copy is different. Before, it showed the
  fingerprint of the key in the server's answer, which a swapping server
  would have made match. It now unlocks first, so it may ask for the master
  password. The web invite page does the same.
- **`.envy.json` `file` must stay inside the project folder** (no absolute
  path, no `..`), and `envy pull` / `envy push` refuse a symbolic link that
  points outside it. The file is committed, so anyone with write access to
  the repository could otherwise make a teammate's `envy pull` replace any
  file, or `envy push` upload another project's `.env`.
- **The server address must be `https://`**, except `http://` for
  `localhost`, `127.0.0.1` and `[::1]`.
- **Atomic writes use a random temporary name created with `wx`**, so a file
  or link planted at the old predictable name cannot catch the content.

**Web**

- **Every page carries a Content-Security-Policy `<meta>`** in production
  builds (scripts may only connect to the site and the API) **and
  `referrer: no-referrer`**, so the dashboard is protected even when the host
  sets no headers, and invite tokens in the address never leak in a
  `Referer`.

**Release pipeline**

- **Actions are pinned to commit SHAs** (a tag can be moved to other code),
  checkouts do not keep the git token, and releases publish **signed build
  provenance** (`gh attestation verify envy-linux-x64 --repo thakurdotdev/envy`).

## Consequences

- Admins who remove a member must make new CI tokens for the ones that
  member created. The CLI lists them.
- A user who restores the server from a backup has to delete `trust.json` on
  each machine, which the error message says.
- Trust on first use does not help the very first time a key is seen; the
  fingerprint comparison on invite still covers that.
- Self-hosters on a LAN must put the API behind HTTPS.

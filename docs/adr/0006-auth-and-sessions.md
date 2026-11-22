# ADR 0006: Sign-in, tokens and sessions

- Status: Accepted
- Date: 2026-11-22

## Context

Phase 2 adds GitHub sign-in for the CLI (device flow) and the web
(redirect flow), short access tokens and rotating refresh tokens. The plan
leaves several details open.

## Decision

- **JWTs are made with `jose` directly** instead of `@elysiajs/jwt`. The
  plugin is a thin wrapper around `jose`, and signing inside the service
  (not the route) keeps the service easy to test with a fake clock. Tokens
  are HS256, 15 minutes, with `sub` = user id and `sid` = session id.
- **Every authenticated request checks the session row**, so revoking a
  session (logout, "sign out this device", reuse detection) takes effect at
  once instead of after up to 15 minutes. It costs one indexed lookup.
- **Refresh token = `<sessionId>.<32 random bytes>`**, stored as a SHA-256
  hash. The session id part lets the server find the session even when an
  old token is presented: an old token ends the whole session
  (`REFRESH_TOKEN_REUSED`; since ADR 0013 only the token just replaced
  counts, a made-up one is simply invalid). The swap is one conditional `UPDATE`, so two
  requests with the same token cannot both win. There is no grace period:
  two CLI processes refreshing at the same moment will end the session, so
  the Phase 4 CLI must refresh under a lock.
- **Each refresh extends the session by 30 days** (sliding expiry).
- **Web sign-in adds `GET /v1/auth/github/login`**, which is not in the
  plan's endpoint list. A static site cannot keep an OAuth `state` secret,
  so the API makes the state, stores it in a short-lived httpOnly cookie,
  redirects to GitHub, and checks it in the callback. On success the refresh
  token is set as an httpOnly, `SameSite=Lax` cookie limited to `/v1/auth`;
  on failure the browser goes to `WEB_URL/login?error=<code>`.
- **`POST /v1/auth/refresh` takes the token from the body (CLI) or the
  cookie (web).** Only the CLI gets the new refresh token in the response
  body; the web gets it as a cookie, so page JavaScript never sees it.
- **The device name is sent with the device poll**, because that is when
  the session is created.
- **A verified primary email is required** from GitHub; otherwise sign-in
  fails with `GITHUB_EMAIL_MISSING`.
- **`GET /v1/me/sessions` returns all active sessions without paging.** A
  user has a handful of devices, so the `{ items }` list has no `nextCursor`.
- **Rate limits are in memory, per IP, per route**: device start 10/min,
  device poll 30/min, web login 20/min, refresh 30/min. They reset on
  restart and are per process, which is fine for one API instance.
- **The error handler returns a plain `Response`**, so the error shape is not
  merged into every route's success type in Eden.
- **Validation errors name the field but never include the value.**

## Consequences

- Running several API instances later needs a shared rate-limit store.
- If the CLI cannot avoid concurrent refreshes, a short grace window for the
  previous token can be added in a new ADR.

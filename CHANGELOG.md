# Changelog

## Unreleased

- The install script and `envy upgrade` send one anonymous count (install, update or upgrade; version; OS and CPU; CI or not). Nothing else, and no other command calls home. `DO_NOT_TRACK=1` or `ENVY_NO_ANALYTICS=1` turns it off.

- API: `TRUST_PROXY` is now the number of proxies in front of the API that append to `X-Forwarded-For` (`true` still means 1). See `docs/deploy.md` for running behind Cloudflare.

## 0.1.2 (2026-11-22)

Security fixes from a second audit (see `docs/security-review.md` and ADR 0013):

- Removing a member also revokes the service tokens they made and their unused invites. The CLI lists the revoked tokens so you can make new ones for CI.
- The CLI remembers teammates' and tokens' public keys and the newest version of each environment (`trust.json`), and refuses a swapped key or a rolled-back environment.
- `envy accept` and the web invite page show the fingerprint of your own key, and refuse if the server has a different one.
- `.envy.json` `file` must stay inside the project folder; links pointing outside it are refused.
- The CLI only talks to `https://` servers (plain `http://` only for localhost).
- API: per-IP rate limits can no longer be dodged with a fake `X-Forwarded-For`; a made-up refresh token no longer ends a session; cookie refreshes must come from the dashboard; production needs `https://` URLs.
- Web: the Content-Security-Policy and `no-referrer` are built into every page.
- Releases: actions pinned to commit SHAs and signed build provenance.

## 0.1.1 (2026-11-22)

- Install script: shows the platform and version, says which version it updates from, shows a download progress bar, skips an install that is already up to date, and prints the exact PATH line for your shell.
- `envy upgrade` (also `envy update`): shows the current and new version, a progress bar and the release notes link; adds `--check`, `--force` and picking a version; works on Windows.
- `envy login` copies the sign-in code to your clipboard before opening GitHub.
- `envy doctor` checks `.env.example` against what envy stores for the environment (what `envy run` injects), not the local `.env`, and warns when the local `.env` is behind envy.

## 0.1.0 (2026-11-22)

First release.

- Zero-knowledge sharing of `.env` secrets: everything is encrypted on your machine or in your browser (Argon2id master password, X25519 keys, XChaCha20-Poly1305 with context binding). The server stores only ciphertext and wrapped keys.
- CLI: `login`, `init`, `pull`, `push`, `run`, `set`, `unset`, `get`, `use`, `env`, `history`, `rollback`, `members`, `accept`, `token`, `doctor`, `completion`, `upgrade`.
- Teams: email-bound invites, fingerprint-checked grants, roles, removal with automatic key rotation.
- CI: read-only service tokens (`ENVY_TOKEN`) for one environment.
- Web dashboard: projects, a secret editor with a table and a .env view (paste or drop a whole .env), history and rollback, members, service tokens, audit log, devices.
- Website: landing page, docs, and the install script at `https://envy.thakur.dev/install.sh`.
- Hardening: security headers, CORS allow-list, body size limits, rate limits on sign-in and every write.

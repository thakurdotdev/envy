# Changelog

## Unreleased

- Website and dashboard: new design. Warm neutral colours with Envy red as the one accent, a mono type for names and commands, light and dark. The landing page shows a .env file next to what the server stores. Commands stay on one line on phones.
- Dashboard: busy buttons keep their label and show a spinner; the variables table, history, members, tokens, audit log and devices share one table and badge style.
- Web: a test fails on uppercase labels, gradients, em dashes and emoji.
- API: warns at start when production runs with `TRUST_PROXY=0`, which makes the audit log show the proxy's address (`::ffff:127.0.0.1`) instead of the visitor's and puts every user in one rate limit.
- API: an IPv4 client seen in IPv6 form (`::ffff:1.2.3.4`) is recorded as plain `1.2.3.4`. Visitors on IPv6-only networks (common on mobile) still show their real IPv6 address.

## 0.1.3 (2026-11-22)

- CLI: the install script and `envy upgrade` send one anonymous count (install, update or upgrade; version; OS and CPU; CI or not). Nothing else, and no other command calls home. `DO_NOT_TRACK=1` or `ENVY_NO_ANALYTICS=1` turns it off.
- Dashboard: pages switch instantly (the header stays, data is kept while it refreshes), project pages share a breadcrumb and tabs, and risky actions (save, rollback, give access, remove, revoke, sign out a device) ask first and show progress.
- Dashboard fixes: a new service token is now shown (it was created but never displayed), and switching environment tabs no longer drops unsaved edits.
- Dashboard: service tokens can expire; the audit log says who did what in plain words; save takes an optional note; works on phones.
- Website: page views on the landing page and docs (Umami). The dashboard loads no analytics.
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

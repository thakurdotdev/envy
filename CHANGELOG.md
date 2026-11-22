# Changelog

## 0.1.0 (unreleased)

First release.

- Zero-knowledge sharing of `.env` secrets: everything is encrypted on your machine or in your browser (Argon2id master password, X25519 keys, XChaCha20-Poly1305 with context binding). The server stores only ciphertext and wrapped keys.
- CLI: `login`, `init`, `pull`, `push`, `run`, `set`, `unset`, `get`, `use`, `env`, `history`, `rollback`, `members`, `accept`, `token`, `doctor`, `completion`, `upgrade`.
- Teams: email-bound invites, fingerprint-checked grants, roles, removal with automatic key rotation.
- CI: read-only service tokens (`ENVY_TOKEN`) for one environment.
- Web dashboard: projects, secret editor, history and rollback, members, service tokens, audit log, devices.
- Hardening: security headers, CORS allow-list, body size limits, rate limits on sign-in and every write.

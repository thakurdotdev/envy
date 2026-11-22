# ADR 0002: Keychain library and libsodium in the compiled CLI

- Status: Accepted for Linux; macOS still to be confirmed
- Date: 2026-11-22

## Context

The CLI is shipped as a single file made with `bun build --compile`. It must
run libsodium (for Argon2id, a slow password hashing function that makes
password guessing expensive) and keep the session tokens and the unlocked
private key in the operating system's keychain.

We tried two keychain options inside a compiled binary:

- `Bun.secrets` — built into Bun, no dependency. Uses macOS Keychain, Windows
  Credential Manager, and libsecret (the GNOME Secret Service) on Linux.
- `@napi-rs/keyring` — a small native addon around the Rust `keyring` crate.
  On Linux it uses the Secret Service when available and otherwise the kernel
  keyring (keyutils).

## What we tested

Linux arm64 (Ubuntu 24.04, over SSH, no desktop), Bun 1.4.5. Each test was
compiled, then run from a different folder with `node_modules` moved away, so
nothing could be loaded from disk.

| Check                                                                   | Result                                          |
| ----------------------------------------------------------------------- | ----------------------------------------------- |
| libsodium-wrappers-sumo 0.8.4: Argon2id, sealed box, XChaCha20 with AAD | Works. Wrong AAD fails to decrypt, as expected  |
| `Bun.secrets` set, get, delete                                          | Fails: `libsecret not available`                |
| `@napi-rs/keyring` 2.1.2 set, get, delete                               | Works. The value is readable from a new process |

macOS was not tested because no Mac was available. This must be checked before
Phase 4 is finished (same three tests, on macOS arm64).

## Decision

- Use libsodium-wrappers-sumo as planned.
- Use `@napi-rs/keyring` for the CLI keystore. It works on SSH and server
  machines where `Bun.secrets` cannot, and many developers work on exactly
  those machines.
- Keep the fallback from the plan for machines where no keychain works at
  all: `~/.config/envy/credentials`, file mode 0600, encrypted with the master
  password, so the user types the master password once per command run.
- The keystore lives behind one small interface in `apps/cli/src/core/`, so
  switching to `Bun.secrets` later is a one-file change.

## Consequences

- On Linux machines without a Secret Service the kernel keyring is used. It is
  cleared on reboot and after a few days without use, so the user is asked for
  the master password again then. That is acceptable.
- `@napi-rs/keyring` ships one native file per platform. A binary compiled on
  one platform for another (`--target`) only includes the right native file if
  that platform's package is installed. Release builds in Phase 8 must either
  build on a runner of each platform or install each platform package first.
  Check that every release binary can read and write the keychain.
- CI never needs a keychain: CI uses service tokens (`ENVY_TOKEN`).

<img src="assets/icon.svg" width="64" height="64" alt="">

# Envy

Share `.env` secrets with your team. Everything is encrypted on your machine
(or in your browser) before it is sent, so the server only ever stores
ciphertext: a full database leak exposes no secrets.

After a one-time `envy init`, you only ever type `envy run` or `envy pull`.

## Install

macOS and Linux (checks the download against its published SHA-256):

```sh
curl -fsSL https://envy.thakur.dev/install.sh | sh
```

Windows: download `envy-windows-x64.exe` from the
[latest release](https://github.com/thakurdotdev/envy/releases/latest) and
compare it with `checksums.txt`. Update later with `envy upgrade`.

## Quick start

**1. Sign up.** Approve the sign-in on GitHub, then choose a master password.
It never leaves your device. Write down the recovery key it shows: without
the password or that key, nobody can recover your secrets.

```sh
envy login
```

**2. Link your project.** In your project folder. This creates the project,
imports your existing `.env` files, writes `.envy.json` (commit it, it holds
no secrets) and adds `.env` files to `.gitignore`.

```sh
envy init
```

**3. Invite a teammate.** Send them the link it prints.

```sh
envy members invite sam@example.com
```

They install envy, run `envy login`, then `envy accept <link>`, which shows
them a key fingerprint. When you run the next command, you see the same
fingerprint: check it with them, then confirm.

```sh
envy members grant
```

They clone the repo and run `envy pull` or `envy run`. That's it.

**4. Run your app** with the variables injected (nothing written to disk):

```sh
envy run -- npm start
```

## Everyday commands

```sh
envy pull                      # write .env
envy push                      # upload your .env as a new version (shows changed keys first)
envy set API_KEY               # set one value (asks for it hidden)
envy run --env staging -- …    # use another environment
envy history                   # versions; envy rollback <n> to restore one
envy doctor                    # check that everything is set up
```

Full list: [docs/commands](docs/commands/README.md). The web dashboard does
everything except `run`.

## Using Envy in CI

Create a read-only token for the environment your CI needs. It is shown once:

```sh
envy token create --env staging --name github-actions --expires 90d
```

Store it as a repository secret called `ENVY_TOKEN`, then:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: oven-sh/setup-bun@v2
      - name: Install envy
        run: |
          curl -fsSL https://envy.thakur.dev/install.sh | sh
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"
      - run: bun install
      - name: Test with secrets injected
        run: envy run -- bun test
        env:
          ENVY_TOKEN: ${{ secrets.ENVY_TOKEN }}
```

The token can only read the one environment it was made for. It cannot push,
see other environments, or read the shared layer. Revoke it any time with
`envy token revoke github-actions`.

## How it works

Your master password (via Argon2id) unlocks your private key. Each
environment has its own key, wrapped separately for every member and token.
Secrets are encrypted with that key and bound to their project, environment
and version, so a tampered or moved blob fails to decrypt. Removing a member
rotates every key. Details: [docs/threat-model.md](docs/threat-model.md).

## Development

You need [Bun](https://bun.com) 1.4.5 and a Postgres 16 database.

```sh
bun install
docker compose up -d                      # or point DATABASE_URL at any Postgres 16
cp apps/api/.env.example apps/api/.env    # then fill in JWT_SECRET and the GitHub app
(cd apps/web && bunx playwright install chromium)   # once, for the browser test
bun run verify
```

See [AGENTS.md](AGENTS.md) for the layout and rules,
[docs/PLAN.md](docs/PLAN.md) for the plan, and
[docs/deploy.md](docs/deploy.md) for deploying.

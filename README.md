<img src="assets/icon.svg" width="64" height="64" alt="">

# Envy

Share `.env` secrets with your team. Secrets are encrypted on your machine, so
the server only ever stores ciphertext.

Envy is under construction. See [docs/PLAN.md](docs/PLAN.md) for the plan and
progress, and [AGENTS.md](AGENTS.md) for how the repo is organised.

## Using the CLI

```sh
envy login                 # sign in with GitHub, set or unlock your master password
envy init                  # link this folder to a project and import its .env files
envy run -- npm start      # run with the variables injected, nothing written to disk
envy pull                  # write .env
envy push                  # upload your .env as a new version
```

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
        run: curl -fsSL https://envy.dev/install.sh | sh
      - run: bun install
      - name: Test with secrets injected
        run: envy run -- bun test
        env:
          ENVY_TOKEN: ${{ secrets.ENVY_TOKEN }}
```

The token can only read the one environment it was made for. It cannot push,
see other environments, or read the shared layer. Revoke it any time with
`envy token revoke github-actions`.

## Development

You need [Bun](https://bun.com) 1.4.5 and a Postgres 16 database.

```sh
bun install
docker compose up -d            # or point DATABASE_URL at any Postgres 16
cp apps/api/.env.example apps/api/.env
bun run verify
```

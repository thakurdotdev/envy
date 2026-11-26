# envy pull / envy push

`envy pull [--env <name>] [--app <name>] [--all]` writes the environment (with the layers under it) to `.env` (or the `file` in `.envy.json`), mode 0600, and prints which keys changed. It warns about keys listed in `.env.example` that are not set.

`envy push [--env <name>] [--app <name>] [--all] [--yes] [-m <note>] [--force]` uploads the file as a new version after showing which keys change. Keys that came unchanged from a lower layer (shared, or the root stage for an app) stay there. If someone pushed after your last pull, it asks before replacing their version; in CI it stops unless `--force` is given.

In a monorepo (see [apps.md](apps.md)), both work on the app of the current folder. At the root they cover the root and every app: `pull` writes each app's file, and `push` asks once and saves every changed app together, or none of them.

Environment choice, in order: `--env`, `ENVY_ENV`, the `branches` map in `.envy.json`, `defaultEnvironment`. Protected environments need `--env` and a confirmation (`--yes` in scripts).

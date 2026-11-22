# envy pull / envy push

`envy pull [--env <name>]` writes the environment (with the shared layer underneath) to `.env` (or the `file` in `.envy.json`), mode 0600, and prints which keys changed. It warns about keys listed in `.env.example` that are not set.

`envy push [--env <name>] [--yes] [-m <note>] [--force]` uploads the file as a new version after showing which keys change. Keys that came unchanged from the shared layer stay there. If someone pushed after your last pull, it asks before replacing their version; in CI it stops unless `--force` is given.

Environment choice, in order: `--env`, `ENVY_ENV`, the `branches` map in `.envy.json`, `defaultEnvironment`. Protected environments need `--env` and a confirmation (`--yes` in scripts).

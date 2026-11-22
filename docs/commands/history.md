# envy history / envy rollback

- `envy history [--env <name>] [-n 20] [--json]` lists versions with who saved them and any note.
- `envy rollback <version> [--env <name>] [--yes]` shows which keys would change, then saves that old version again as the newest one. Nothing is deleted.

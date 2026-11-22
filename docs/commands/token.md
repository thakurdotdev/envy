# envy token

Read-only service tokens for CI.

- `envy token create [--env <name>] [--name <name>] [--expires 90d]` prints a token once. Store it as the `ENVY_TOKEN` secret in CI.
- `envy token ls [--json]` lists tokens and when they were last used.
- `envy token revoke <name>` stops a token at once.

A token reads one environment and nothing else. Only its id part is ever sent to the server.

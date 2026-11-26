# envy token

Read-only service tokens for CI.

- `envy token create [--env <name>] [--app <name>] [--name <name>] [--expires 90d]` prints a token once. Store it as the `ENVY_TOKEN` secret in CI.
- `envy token ls [--json]` lists tokens and when they were last used.
- `envy token revoke <name>` stops a token at once.

A token reads one environment and the layers under it (`shared`, and the root stage for an app's environment), so CI gets the same values as `envy run`. It reads nothing else. Tokens made before version 0.3.0 read only their one environment. Only its id part is ever sent to the server.

# envy set / unset / get / use

- `envy set KEY=value [KEY2=value2…]` saves a new version. `envy set KEY` asks for the value without showing it (and keeps it out of your shell history).
- `envy unset KEY…` removes keys.
- `envy get KEY [--json]` prints one value to stdout: the only command that prints values.
- `envy use <environment>` sets the folder's default environment in `.envy.json` (not allowed for protected environments).

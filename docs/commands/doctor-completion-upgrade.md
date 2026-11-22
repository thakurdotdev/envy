# envy doctor / completion / upgrade

- `envy doctor [--json]` checks the server, sign-in, keychain, `.envy.json`, `.gitignore`, access, and keys from `.env.example` that envy does not store (it also says when your local `.env` is behind envy), and exits 1 if something is broken.
- `envy completion bash|zsh|fish` prints a completion script, for example `envy completion zsh > ~/.zfunc/_envy`.
- `envy upgrade [version]` (or `envy update`) shows your version and the new one, downloads it with a progress bar, checks its SHA-256 and replaces itself. Leave out the version for the latest.
  - `--check` only says whether a new version is available.
  - `--force` reinstalls the version you already have.
- `envy` alone opens a menu of common actions (in a terminal).

Exit codes: 0 success, 1 your input, 2 sign-in, 3 network or server, or the command's own code for `envy run`.

# envy doctor / completion / upgrade

- `envy doctor [--json]` checks the server, sign-in, keychain, `.envy.json`, `.gitignore`, access and missing keys, and exits 1 if something is broken.
- `envy completion bash|zsh|fish` prints a completion script, for example `envy completion zsh > ~/.zfunc/_envy`.
- `envy upgrade` installs the latest release after checking its SHA-256.
- `envy` alone opens a menu of common actions (in a terminal).

Exit codes: 0 success, 1 your input, 2 sign-in, 3 network or server, or the command's own code for `envy run`.

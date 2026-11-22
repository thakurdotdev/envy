# envy run

`envy run [--env <name>] -- <command…>` runs a command with the environment's variables (and the shared layer) injected. Nothing is written to disk. The command's exit code is passed through; Ctrl+C and stop signals go to the command.

With `ENVY_TOKEN` set (CI), no sign-in or `.envy.json` is needed; the token decides the environment, and the shared layer is not included.

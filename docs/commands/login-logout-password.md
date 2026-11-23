# envy login / envy logout / envy password / envy recover

`envy login [--api-url <url>]` signs in with GitHub (device flow: the sign-in code is copied to your clipboard and GitHub opens in your browser, so you only paste it and approve). The first time, it asks you to choose a master password and shows your **recovery key** once. On a new device it asks for the master password to unlock your keys. Admins are then asked once whether to give waiting teammates access.

`envy logout` signs this device out on the server and removes its keys and tokens.

`envy password` changes your master password for every device. It asks for the current one first. Your recovery key keeps working.

`envy recover` is for a forgotten master password: type your recovery key, then choose a new master password. A new recovery key replaces the old one and is shown once.

Both keep your keypair, so teammates do not need to give you access again. If someone may have your private key itself (not just the password), ask a project admin to remove you and invite you again.

- `--api-url` uses your own Envy server and remembers it.
- Scripts: set `ENVY_MASTER_PASSWORD` instead of typing it. For `envy password` and `envy recover`, `ENVY_NEW_MASTER_PASSWORD` gives the new password and `ENVY_RECOVERY_KEY` the recovery key.

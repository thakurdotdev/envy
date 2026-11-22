# envy login / envy logout

`envy login [--api-url <url>]` signs in with GitHub (device flow: the sign-in code is copied to your clipboard and GitHub opens in your browser, so you only paste it and approve). The first time, it asks you to choose a master password and shows your **recovery key** once. On a new device it asks for the master password to unlock your keys. Admins are then asked once whether to give waiting teammates access.

`envy logout` signs this device out on the server and removes its keys and tokens.

- `--api-url` uses your own Envy server and remembers it.
- Scripts: set `ENVY_MASTER_PASSWORD` instead of typing it.

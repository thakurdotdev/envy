# envy login / envy logout

`envy login [--api-url <url>]` signs in with GitHub (device flow: the browser opens and you type the short code GitHub shows). The first time, it asks you to choose a master password and shows your **recovery key** once. On a new device it asks for the master password to unlock your keys. Admins are then asked once whether to give waiting teammates access.

`envy logout` signs this device out on the server and removes its keys and tokens.

- `--api-url` uses your own Envy server and remembers it.
- Scripts: set `ENVY_MASTER_PASSWORD` instead of typing it.

# envy init

Links the current folder to a project: pick one or create one, import existing `.env` files, write `.envy.json` (commit it, it holds no secrets) and add `.env` files to `.gitignore`.

`.env` is imported into `development`, `.env.<name>` into the environment of that name. `.env.example`, `.env.sample`, `.env.template` and `*.local` files are never imported, and files are only imported into empty environments.

| Option             | Meaning                               |
| ------------------ | ------------------------------------- |
| `--create <name>`  | create a new project                  |
| `--project <name>` | link to an existing project           |
| `--yes`            | import the found files without asking |
| `--force`          | replace an existing `.envy.json`      |

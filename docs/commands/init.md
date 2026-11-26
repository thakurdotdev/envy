# envy init

Links the current folder to a project: pick one or create one, import existing `.env` files, write `.envy.json` (commit it, it holds no secrets) and add `.env` files to `.gitignore`.

In a monorepo, it also finds the workspace folders (from `package.json` workspaces, `pnpm-workspace.yaml`, or folders that hold `.env` files) and offers to add each one as an app with its own environments (see [apps.md](apps.md)).

`.env` is imported into `development`, `.env.<name>` into the environment of that name. `.env.example`, `.env.sample`, `.env.template` and `*.local` files are never imported, and files are only imported into empty environments.

| Option             | Meaning                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `--create <name>`  | create a new project                                                                                |
| `--project <name>` | link to an existing project                                                                         |
| `--yes`            | import the found files without asking, and add the workspace folders that have `.env` files as apps |
| `--force`          | replace an existing `.envy.json`                                                                    |

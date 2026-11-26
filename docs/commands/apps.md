# envy apps

Apps of a monorepo (ADR 0018). An app is a folder of the repo, such as
`apps/web`, with its own `.env` file and its own environments. It gets three
layers, merged with the later one winning:

1. `shared`: every app, every stage
2. the root stage, such as `development`: every app in that stage
3. the app's own stage, such as `web/development`

- `envy apps ls [--json]` lists the project's apps and the folder each one uses here.
- `envy apps add <folder> [--name <name>] [--file <file>] [--no-inherit-root] [--yes]` makes a folder an app: one new environment for each stage, keys made on your machine and wrapped for every active member. It offers to import the folder's `.env` files and adds the app to `.envy.json` (commit it). `--no-inherit-root` skips layer 2 for that app.
- `envy apps rm <name> [--yes]` removes an app for everyone. Its secrets are no longer served and its service tokens stop working.

`.envy.json` with apps:

```json
{
  "projectId": "…",
  "defaultEnvironment": "development",
  "file": ".env",
  "apps": {
    "api": { "path": "apps/api" },
    "web": { "path": "apps/web", "file": ".env.local" }
  }
}
```

## Which app a command uses

- Inside an app's folder, commands use that app (the deepest folder wins).
- `--app <name>` picks one from anywhere; `--app root` is the root.
- At the root, `envy pull` and `envy push` cover the root and every app. `envy push` shows one diff per app, asks once, and saves them all or none. `--all` does the same from inside an app's folder.
- `envy run`, `get`, `set`, `unset`, `history`, `rollback` and `token create` work on one place: `--app`, else the folder's app, else the root.

`envy run` at the root cannot give each app its own variables. Run each app with
its own `envy run -- …` (for example in its `dev` script), or `envy pull` first.

# envy projects

- `envy projects ls [--deleted] [--json]` lists your projects and your role in each. `--deleted` lists the projects you deleted that can still be restored.
- `envy projects rm <project> [--yes]` deletes a project (owner only). In a terminal you type its slug to confirm; in scripts pass `--yes`. Everyone loses access at once and its service tokens stop working.
- `envy projects restore <project>` brings back a project you deleted less than 30 days ago, with its members, keys, tokens and history.

After 30 days a deleted project is removed for good: its encrypted secrets, wrapped keys, tokens, members, invites and audit log. The API does this once a day.

The dashboard does the same: **Settings** in a project (rename, delete) and **Recently deleted** on the projects page.

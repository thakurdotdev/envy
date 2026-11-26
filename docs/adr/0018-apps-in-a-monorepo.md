# ADR 0018: Apps in a monorepo

- Status: Accepted
- Date: 2026-11-26

## Context

One `.envy.json` linked one folder to one project and one `.env` file. A
monorepo has many apps and packages (`apps/api`, `apps/web`, `packages/db`),
each with its own `.env`, and some values are the same for all of them. Teams
want to manage all of them from the repo root, and still run one app from its
own folder.

## Decision

### Apps inside a project

- A project has **apps**. An app is a name (`api`, `web`, same pattern as
  environment names; `root` is reserved). The server knows only the name;
  the folder lives in `.envy.json`.
- Each app has **its own environments**, one for each non-shared root
  environment (development, staging, production…), each with its own key,
  versions, history and service tokens. An app environment is an ordinary
  environment with `appId` set, so key wrapping, rotation, grants, history
  and conflict checks work unchanged.
- The project's existing environments are the **root**. A project with no
  apps works exactly as before.
- **Stages stay in sync.** Creating an app needs exactly one environment for
  each root stage (names and protection are copied from the root). Adding a
  root environment needs one for every app too, in the same request. Both
  are refused with `APP_ENVIRONMENTS_MISMATCH` otherwise.
- **Members are per project.** Granting a member and removing one (with
  rotation) cover every environment, app environments included.
- **Removing an app** is a soft delete (admin): its environments stop being
  served and its service tokens are revoked.
- Environment names are unique per (project, app); `NULLS NOT DISTINCT`
  keeps root names unique too.

### Layers

Lowest first; a later layer wins:

1. `shared` (root): every app, every stage.
2. The root stage, such as `development`: every app in that stage.
3. The app's stage, such as `web/development`.

An app can set `"inheritRoot": false` in `.envy.json` to skip layer 2.
`shared` is always merged. `envy push` from an app folder sends only the app
layer: a key whose value came unchanged from a lower layer is not copied up
(the old shared rule, now for any number of layers).

### `.envy.json`

```json
{
  "projectId": "…",
  "defaultEnvironment": "development",
  "file": ".env",
  "apps": {
    "api": { "path": "apps/api" },
    "web": { "path": "apps/web", "file": ".env.local", "inheritRoot": true }
  }
}
```

`path` and `file` must stay inside the repo (same checks as `file`, symbolic
links included). The CLI picks the app whose `path` holds the current folder
(the deepest wins); outside every app it works on the root.

### Commands

- In an app folder, `pull`, `push`, `run`, `get`, `set`, `unset`, `history`
  and `rollback` work on that app. `--app <name>` picks one from anywhere
  (`--app root` for the root).
- At the root, `pull` and `push` work on the root **and every app**. `push`
  shows one diff per app and asks once.
- `envy apps ls|add|rm`. `envy init` finds workspace folders and offers to
  add them as apps.

### All-or-nothing push

`POST /v1/projects/:id/secrets` takes several pushes and saves them in one
transaction: if any one has an old `baseVersion` or key version, nothing is
saved (409 with the environment id in `details`). Every diff is computed
against what the server had before the push, so a root change is never
mistaken for an app override.

### Compatibility

- `GET /v1/projects/:id/environments` lists only root environments unless
  `?apps=true`, so an older CLI that finds environments by name never picks
  an app environment by mistake. Older clients that grant or remove members
  in a project with apps are refused (they would miss app environments),
  which is safe.

### Service tokens read their layers

A token is still made for one environment, but it can also read that
environment's lower layers, so CI gets the same values as `envy run`. When
the token is made, the client wraps each layer's key for it too;
`service_tokens.layer_environment_ids` records which ones. The server
accepts only the real layers of the token's environment. Rotating a layer
environment must re-wrap for every active token that reads it. Older tokens
have no layers and keep reading one environment.

## Consequences

- Each app adds one key per stage per member, which is fine at team sizes.
- Per-app access (a member who sees only `web`) is not part of this; it would
  need app-level membership.
- `envy run` at the root cannot give different variables to several
  processes at once; each app's own script should call `envy run`.

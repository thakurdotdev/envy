# ADR 0014: Dashboard frame, data cache and safer actions

- Status: Accepted
- Date: 2026-11-22

## Context

Changing pages in the dashboard felt like a full reload. It was a client-side
navigation, but every page rebuilt its header and session gate, showed
skeletons and fetched everything again. Reloading data also wiped whatever
was below it: a new service token was created but never shown, because the
list reloaded and unmounted the form holding it. Switching environment tabs
dropped unsaved edits without a word.

## Decision

- **The header and `SessionGate` live in the `(app)` layout** (`DashboardFrame`),
  so they stay mounted across pages. `/login` keeps its own full-screen layout.
- **`useLoad` keeps the current data on screen while it refreshes**
  (`refreshing: true`) instead of going back to a skeleton. A failed refresh
  keeps the data and shows a toast.
- **An in-memory cache** (`cacheKey`) shows the last answer at once when a
  page is opened again, then refreshes it. It holds only data the server
  already sees in the clear (project names, environments, members, tokens,
  audit entries, devices), never decrypted values, and is cleared on lock,
  idle lock, `pagehide` and sign-out.
- **Project pages share `ProjectFrame`**: breadcrumb, name, role and a
  sub-navigation (Variables, Members, Service tokens, Audit log).
- **Environment editors stay mounted once opened**, so edits survive tab
  switches. Tabs with unsaved edits are marked, and leaving the page (link,
  reload, closing the tab) asks first.
- **Actions that are hard to undo ask first and stay open until done**: save
  (with an optional note for the history), rollback, grant, remove, revoking
  a token, signing out a device. A new token is shown in a dialog that stays
  until the user confirms they stored it.
- **The audit API returns `actorName`** (`@login` or the token name), so the
  log says who did what.

## Consequences

- Moving between dashboard pages shows cached content immediately; data may
  be a moment old until the background refresh lands.
- Opened environments keep their decrypted values in memory until the page
  is left or locked, as one open environment already did.

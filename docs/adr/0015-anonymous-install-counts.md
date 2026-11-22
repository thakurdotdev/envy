# ADR 0015: Anonymous install and upgrade counts

- Status: Accepted
- Date: 2026-11-22

## Context

We want to know how many people install Envy and which versions are in use.
GitHub counts release downloads, but those mix installs, upgrades, CI runs
and retries, and say nothing about versions people actually run. Envy is a
zero-knowledge secrets tool: a CLI that quietly reports on its users would
undermine the trust the product depends on.

## Decision

- **Exactly two moments are counted:** the end of a successful run of
  `install.sh` (`cli-install`, or `cli-update` when envy was already there)
  and the end of a successful `envy upgrade` (`cli-upgrade`). No other
  command sends anything, ever.
- **What is sent, and nothing more:** the event name, the version (and for an
  upgrade the version it came from), OS, CPU, and whether `CI` is set. No
  user, email, machine name, project, path, token or command. The request
  goes to the self-hosted Umami at `analytics.thakur.dev`, which, like any web
  server, sees the IP address; Umami does not store it.
- **Opt-out, announced every time:** `DO_NOT_TRACK=1` (the common convention)
  or `ENVY_NO_ANALYTICS=1` turns it off. When a count is sent, the output says
  so in one line, with the opt-out. The README and the docs page say the same.
- **It can never hurt the command:** the install script sends it in the
  background with a 5-second limit, `envy upgrade` waits at most 2 seconds,
  and every error is ignored.
- **User agent `envy-cli/<version> (<os>; <arch>)`,** because Umami drops
  requests whose user agent looks like a bot, as curl's does.
- **Tests never reach the real server:** `ENVY_ANALYTICS_URL` points them at a
  local fake, and they check the exact body that is sent.
- Usage inside the CLI (which commands run, how often) is **not** counted. If
  that is ever wanted, it must be opt-in.

## Consequences

- Install and upgrade numbers show up in Umami next to the website's.
- People who set `DO_NOT_TRACK` are not counted, so numbers are a floor.

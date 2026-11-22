// Anonymous counts of CLI upgrades, so we know how many people use which
// version. Sent once after `envy upgrade` succeeds, and never anything else:
// no command usage, names, projects, files, machine names or tokens. The
// install script sends the same kind of count after an install.
//
// Turned off by DO_NOT_TRACK=1 (the common convention) or ENVY_NO_ANALYTICS=1.
// It may never slow down or break a command: a short timeout, errors ignored.

/** Umami, self-hosted. ENVY_ANALYTICS_URL overrides it (tests). */
const DEFAULT_ANALYTICS_URL = "https://analytics.thakur.dev";
const WEBSITE_ID = "67b6d992-f2da-46f9-904b-43ec0114349e";
const TIMEOUT_MS = 2000;

type Environment = Record<string, string | undefined>;
/** How the request is sent; tests pass their own. */
type Send = (url: string, init: RequestInit) => Promise<unknown>;

/** False when the user opted out with DO_NOT_TRACK or ENVY_NO_ANALYTICS. */
export function analyticsAllowed(environment: Environment = process.env): boolean {
  const isSet = (name: string) => {
    const value = environment[name]?.trim().toLowerCase();
    return value !== undefined && value !== "" && value !== "0" && value !== "false";
  };
  return !isSet("DO_NOT_TRACK") && !isSet("ENVY_NO_ANALYTICS");
}

/** Versions are shown as-is, so keep only characters a version can have. */
function cleanVersion(version: string): string {
  return version.replace(/[^0-9A-Za-z.+-]/g, "").slice(0, 40) || "unknown";
}

export type UpgradeCount = {
  from: string;
  to: string;
  os: string;
  arch: string;
};

/** The whole request body. Everything that is sent is in here. */
export function buildUpgradeEvent(count: UpgradeCount, environment: Environment = process.env) {
  return {
    type: "event",
    payload: {
      website: WEBSITE_ID,
      hostname: "envy.thakur.dev",
      url: "/cli/upgrade",
      name: "cli-upgrade",
      data: {
        from: cleanVersion(count.from),
        to: cleanVersion(count.to),
        os: count.os,
        arch: count.arch,
        ci: environment["CI"] !== undefined && environment["CI"] !== "",
      },
    },
  };
}

/** Sends the upgrade count unless the user opted out. Never throws. */
export async function countUpgrade(
  count: UpgradeCount,
  options: { environment?: Environment; send?: Send } = {},
): Promise<void> {
  const environment = options.environment ?? process.env;
  if (!analyticsAllowed(environment)) {
    return;
  }
  const base = environment["ENVY_ANALYTICS_URL"] || DEFAULT_ANALYTICS_URL;
  try {
    const send: Send = options.send ?? fetch;
    await send(`${base}/api/send`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Umami drops requests whose user agent looks like a bot (curl does).
        "user-agent": `envy-cli/${cleanVersion(count.to)} (${count.os}; ${count.arch})`,
      },
      body: JSON.stringify(buildUpgradeEvent(count, environment)),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // Offline, blocked or slow: the upgrade itself already worked.
  }
}

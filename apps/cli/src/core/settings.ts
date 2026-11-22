import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CliError } from "./errors.ts";
import { getConfigDir } from "./paths.ts";

// config.json: non-secret settings. state.json: what the CLI remembers
// between runs, such as the last version pulled for each environment.

// Release builds set ENVY_BUILD_API_URL with `bun build --define`, so the
// downloaded binary talks to the real server without any setup.
export const DEFAULT_API_URL = process.env["ENVY_BUILD_API_URL"] || "http://localhost:3000";

type Settings = { apiUrl?: string; lastUserLogin?: string };
type State = { pulledVersions?: Record<string, number> };

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? Object.fromEntries(Object.entries(parsed))
      : {};
  } catch {
    // A missing or broken file means "nothing saved yet".
    return {};
  }
}

/**
 * Writes to a temporary file first, so a crash never leaves half a file.
 * The temporary name is random and must not exist yet ("wx"), so nobody can
 * plant a file or link there beforehand to catch what is written.
 */
export async function writeFileSafely(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  try {
    await writeFile(temporaryPath, content, { mode, flag: "wx" });
    await chmod(temporaryPath, mode);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readSettings(): Promise<Settings> {
  const raw = await readJsonObject(join(getConfigDir(), "config.json"));
  return {
    ...(typeof raw["apiUrl"] === "string" ? { apiUrl: raw["apiUrl"] } : {}),
    ...(typeof raw["lastUserLogin"] === "string" ? { lastUserLogin: raw["lastUserLogin"] } : {}),
  };
}

export async function updateSettings(change: Settings): Promise<void> {
  const current = await readSettings();
  await writeFileSafely(
    join(getConfigDir(), "config.json"),
    `${JSON.stringify({ ...current, ...change }, null, 2)}\n`,
    0o644,
  );
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Checks a server address. Plain http:// is only allowed for this machine
 * itself: anywhere else, sign-in tokens would cross the network unprotected.
 */
export function checkApiUrl(url: string): string {
  const parsed = URL.parse(url);
  const isHttps = parsed?.protocol === "https:";
  const isLocalHttp = parsed?.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname);
  if (parsed === null || (!isHttps && !isLocalHttp)) {
    throw new CliError(`The server address ${url} is not a safe https:// address.`, {
      hint: "Use an https:// address (plain http:// only works for localhost).",
    });
  }
  return url.replace(/\/+$/, "");
}

/** ENVY_API_URL wins, then the saved setting, then the default. */
export async function resolveApiUrl(): Promise<string> {
  const fromEnvironment = process.env["ENVY_API_URL"];
  return checkApiUrl(fromEnvironment || (await readSettings()).apiUrl || DEFAULT_API_URL);
}

async function readState(): Promise<State> {
  const raw = await readJsonObject(join(getConfigDir(), "state.json"));
  const pulled = raw["pulledVersions"];
  const pulledVersions: Record<string, number> = {};
  if (typeof pulled === "object" && pulled !== null) {
    for (const [environmentId, version] of Object.entries(pulled)) {
      if (typeof version === "number") {
        pulledVersions[environmentId] = version;
      }
    }
  }
  return { pulledVersions };
}

/** The version this machine last pulled or pushed for an environment. */
export async function getPulledVersion(environmentId: string): Promise<number | undefined> {
  return (await readState()).pulledVersions?.[environmentId];
}

export async function setPulledVersion(environmentId: string, version: number): Promise<void> {
  const state = await readState();
  const pulledVersions = { ...state.pulledVersions, [environmentId]: version };
  await writeFileSafely(
    join(getConfigDir(), "state.json"),
    `${JSON.stringify({ ...state, pulledVersions }, null, 2)}\n`,
  );
}

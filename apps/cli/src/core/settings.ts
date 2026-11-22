import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getConfigDir } from "./paths.ts";

// config.json: non-secret settings. state.json: what the CLI remembers
// between runs, such as the last version pulled for each environment.

export const DEFAULT_API_URL = "http://localhost:3000";

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

/** Writes to a temporary file first, so a crash never leaves half a file. */
export async function writeFileSafely(path: string, content: string, mode = 0o600): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, content, { mode });
  await chmod(temporaryPath, mode);
  await rename(temporaryPath, path);
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

/** ENVY_API_URL wins, then the saved setting, then the default. */
export async function resolveApiUrl(): Promise<string> {
  const fromEnvironment = process.env["ENVY_API_URL"];
  const url = fromEnvironment || (await readSettings()).apiUrl || DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
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

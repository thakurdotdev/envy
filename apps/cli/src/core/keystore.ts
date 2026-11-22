import { Entry } from "@napi-rs/keyring";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { getConfigDir } from "./paths.ts";
import { writeFileSafely } from "./settings.ts";

/** What the CLI keeps between runs to stay signed in. */
export type StoredCredentials = {
  apiUrl: string;
  userId: string;
  accessToken: string;
  /** Milliseconds since 1970. */
  accessTokenExpiresAt: number;
  refreshToken: string;
  /**
   * The unlocked private key (base64url). Only kept in the OS keychain; the
   * file keystore never stores it, so there the master password is asked
   * for each time (or read from ENVY_MASTER_PASSWORD).
   */
  privateKey?: string;
};

export type Keystore = {
  kind: "keychain" | "file";
  load(apiUrl: string): Promise<StoredCredentials | undefined>;
  save(credentials: StoredCredentials): Promise<void>;
  clear(apiUrl: string): Promise<void>;
};

const SERVICE = "envy";

function parseCredentials(text: string | null | undefined): StoredCredentials | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const record = Object.fromEntries(Object.entries(value));
    const { apiUrl, userId, accessToken, accessTokenExpiresAt, refreshToken, privateKey } = record;
    if (
      typeof apiUrl !== "string" ||
      typeof userId !== "string" ||
      typeof accessToken !== "string" ||
      typeof accessTokenExpiresAt !== "number" ||
      typeof refreshToken !== "string"
    ) {
      return undefined;
    }
    return {
      apiUrl,
      userId,
      accessToken,
      accessTokenExpiresAt,
      refreshToken,
      ...(typeof privateKey === "string" ? { privateKey } : {}),
    };
  } catch {
    return undefined;
  }
}

/** The OS keychain: macOS Keychain, Windows Credential Manager, Secret Service or the Linux kernel keyring. */
export function createKeychainKeystore(): Keystore {
  return {
    kind: "keychain",
    async load(apiUrl) {
      return parseCredentials(new Entry(SERVICE, apiUrl).getPassword());
    },
    async save(credentials) {
      new Entry(SERVICE, credentials.apiUrl).setPassword(JSON.stringify(credentials));
    },
    async clear(apiUrl) {
      try {
        new Entry(SERVICE, apiUrl).deletePassword();
      } catch {
        // Nothing stored: nothing to clear.
      }
    },
  };
}

/** Fallback for machines without a working keychain: a 0600 file, never holding the private key. */
export function createFileKeystore(): Keystore {
  const path = join(getConfigDir(), "credentials.json");

  async function readAll(): Promise<Record<string, unknown>> {
    try {
      const value: unknown = JSON.parse(await readFile(path, "utf8"));
      return typeof value === "object" && value !== null
        ? Object.fromEntries(Object.entries(value))
        : {};
    } catch {
      return {};
    }
  }

  return {
    kind: "file",
    async load(apiUrl) {
      const all = await readAll();
      return parseCredentials(JSON.stringify(all[apiUrl] ?? null));
    },
    async save(credentials) {
      const all = await readAll();
      const { privateKey: _privateKeyIsNeverWrittenToDisk, ...withoutPrivateKey } = credentials;
      all[credentials.apiUrl] = withoutPrivateKey;
      await writeFileSafely(path, `${JSON.stringify(all, null, 2)}\n`, 0o600);
    },
    async clear(apiUrl) {
      const all = await readAll();
      delete all[apiUrl];
      if (Object.keys(all).length === 0) {
        await rm(path, { force: true });
      } else {
        await writeFileSafely(path, `${JSON.stringify(all, null, 2)}\n`, 0o600);
      }
    },
  };
}

let chosen: Keystore | undefined;

/**
 * Picks the keystore once per run. ENVY_KEYSTORE=file or =keychain forces one;
 * otherwise the keychain is tried with a test value and the file is used if
 * the keychain does not work (for example on a server without a keyring).
 */
export function getKeystore(): Keystore {
  if (chosen !== undefined) {
    return chosen;
  }
  const forced = process.env["ENVY_KEYSTORE"];
  if (forced === "file") {
    chosen = createFileKeystore();
  } else if (forced === "keychain" || keychainWorks()) {
    chosen = createKeychainKeystore();
  } else {
    chosen = createFileKeystore();
  }
  return chosen;
}

function keychainWorks(): boolean {
  try {
    const probe = new Entry(SERVICE, "envy-keychain-check");
    probe.setPassword("ok");
    const works = probe.getPassword() === "ok";
    probe.deletePassword();
    return works;
  } catch {
    return false;
  }
}

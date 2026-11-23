import {
  CryptoError,
  decryptPrivateKey,
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  encryptPrivateKey,
  fromBase64Url,
  generateRecoveryKey,
  generateSalt,
  generateUserKeys,
  getPublicKey,
  toBase64Url,
  clearKey,
} from "@envy/crypto";
import { output } from "../ui/output.ts";
import { askPassword, isInteractive } from "../ui/prompts.ts";
import { CliError, EXIT_CODES } from "./errors.ts";
import { getKeystore } from "./keystore.ts";
import type { Session } from "./session.ts";

const MASTER_PASSWORD_VARIABLE = "ENVY_MASTER_PASSWORD";
const MINIMUM_PASSWORD_LENGTH = 10;
const MAX_ATTEMPTS = 3;

export type UnlockedKeys = { publicKey: Uint8Array; privateKey: Uint8Array };

/**
 * Returns the user's private key: from the keychain if it was cached there,
 * otherwise by asking for the master password and decrypting the copy stored
 * on the server.
 */
export async function getUnlockedKeys(session: Session): Promise<UnlockedKeys> {
  const cached = session.credentials.privateKey;
  if (cached !== undefined) {
    const privateKey = await fromBase64Url(cached);
    return { privateKey, publicKey: await getPublicKey(privateKey) };
  }
  return unlockWithMasterPassword(session);
}

export async function unlockWithMasterPassword(session: Session): Promise<UnlockedKeys> {
  const me = await session.call((api) => api.v1.me.get());
  if (me.keys === null) {
    throw new CliError("Your account has no master password yet.", {
      hint: "Run envy login to set one.",
    });
  }
  const keys = me.keys;
  const salt = await fromBase64Url(keys.kdfSalt);
  const encryptedPrivateKey = await fromBase64Url(keys.encryptedPrivateKey);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const password = await readMasterPassword("Master password");
    const masterKey = await deriveMasterKey(password, salt, keys.kdfParams);
    try {
      const privateKey = await decryptPrivateKey(encryptedPrivateKey, masterKey);
      await cachePrivateKey(session, privateKey);
      return { privateKey, publicKey: await getPublicKey(privateKey) };
    } catch (error) {
      const isWrongPassword = error instanceof CryptoError && error.code === "DECRYPTION_FAILED";
      // With the password from the environment, asking again would loop forever.
      if (!isWrongPassword || !isInteractive()) {
        throw wrongPassword();
      }
      output.warn("That master password is not right.");
    } finally {
      await clearKey(masterKey);
    }
  }
  throw wrongPassword();
}

/** First sign-in: makes the keypair and the recovery key, and stores the encrypted copies. */
export async function setUpNewKeys(session: Session): Promise<{ recoveryKeyText: string }> {
  const password = await chooseMasterPassword();
  const { publicKey, privateKey } = await generateUserKeys();
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey(password, salt, DEFAULT_KDF_PARAMS);
  const recovery = await generateRecoveryKey();
  try {
    const keyMaterial = {
      publicKey: await toBase64Url(publicKey),
      encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(privateKey, masterKey)),
      recoveryEncryptedPrivateKey: await toBase64Url(
        await encryptPrivateKey(privateKey, recovery.key),
      ),
      kdfSalt: await toBase64Url(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
    };
    await session.call((api) => api.v1.me.keys.put(keyMaterial));
  } finally {
    await clearKey(masterKey);
    await clearKey(recovery.key);
  }
  await cachePrivateKey(session, privateKey);
  return { recoveryKeyText: recovery.text };
}

export async function cachePrivateKey(session: Session, privateKey: Uint8Array): Promise<void> {
  // Only the OS keychain may hold the unlocked key; the file keystore never does.
  if (getKeystore().kind === "keychain") {
    await session.saveCredentials({ privateKey: await toBase64Url(privateKey) });
  }
}

async function readMasterPassword(message: string): Promise<string> {
  const fromEnvironment = process.env[MASTER_PASSWORD_VARIABLE];
  if (fromEnvironment) {
    return fromEnvironment;
  }
  return askPassword(message, `Set ${MASTER_PASSWORD_VARIABLE}, or run this in a terminal.`);
}

/**
 * Asks for a new master password twice. `variable` is the environment
 * variable that answers instead, for scripts and tests.
 */
export async function chooseMasterPassword(variable = MASTER_PASSWORD_VARIABLE): Promise<string> {
  const fromEnvironment = process.env[variable];
  if (fromEnvironment) {
    assertStrongEnough(fromEnvironment);
    return fromEnvironment;
  }
  const hint = `Set ${variable}, or run this in a terminal.`;
  for (;;) {
    const password = await askPassword(
      "Choose a master password (it never leaves this device)",
      hint,
    );
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      output.warn(`Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
      continue;
    }
    const again = await askPassword("Type it again", hint);
    if (again === password) {
      return password;
    }
    output.warn("The two passwords are different. Try again.");
  }
}

function assertStrongEnough(password: string): void {
  if (password.length < MINIMUM_PASSWORD_LENGTH) {
    throw new CliError(
      `The master password must have at least ${MINIMUM_PASSWORD_LENGTH} characters.`,
    );
  }
}

function wrongPassword(): CliError {
  return new CliError("The master password is not right.", {
    exitCode: EXIT_CODES.authError,
    hint: "Try again. If you forgot it, run envy recover with your recovery key.",
  });
}

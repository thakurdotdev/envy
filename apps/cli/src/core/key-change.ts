import {
  answerKeyChallenge,
  clearKey,
  CryptoError,
  decryptPrivateKey,
  DEFAULT_KDF_PARAMS,
  deriveMasterKey,
  encryptPrivateKey,
  fromBase64Url,
  generateRecoveryKey,
  generateSalt,
  getPublicKey,
  parseRecoveryKey,
  toBase64Url,
} from "@envy/crypto";
import { CliError, EXIT_CODES } from "./errors.ts";
import type { Session } from "./session.ts";
import type { UnlockedKeys } from "./unlock.ts";

// A new master password, or a way back in with the recovery key. The keypair
// never changes (teammates' copies of the environment keys are wrapped for
// it); only the encrypted copies of the private key stored on the server do.

/**
 * Encrypts the private key with a new master password (and, when asked, a
 * new recovery key) and stores the copies. The server first checks that this
 * device holds the private key.
 *
 * @returns The new recovery key text, when one was made.
 */
export async function storeNewKeyCopies(
  session: Session,
  privateKey: Uint8Array,
  options: { newPassword: string; newRecoveryKey: boolean },
): Promise<{ recoveryKeyText: string | undefined }> {
  const challenge = await session.call((api) => api.v1.me.keys.challenge.post());
  const answer = await answerKeyChallenge(
    await fromBase64Url(challenge.sealedChallenge),
    privateKey,
  );
  const salt = await generateSalt();
  const masterKey = await deriveMasterKey(options.newPassword, salt, DEFAULT_KDF_PARAMS);
  const recovery = options.newRecoveryKey ? await generateRecoveryKey() : undefined;
  try {
    const body = {
      challengeToken: challenge.challengeToken,
      challengeAnswer: await toBase64Url(answer),
      encryptedPrivateKey: await toBase64Url(await encryptPrivateKey(privateKey, masterKey)),
      kdfSalt: await toBase64Url(salt),
      kdfParams: DEFAULT_KDF_PARAMS,
      ...(recovery === undefined
        ? {}
        : {
            recoveryEncryptedPrivateKey: await toBase64Url(
              await encryptPrivateKey(privateKey, recovery.key),
            ),
          }),
    };
    await session.call((api) => api.v1.me.keys.replace.post(body));
  } finally {
    await clearKey(masterKey);
    if (recovery !== undefined) {
      await clearKey(recovery.key);
    }
  }
  return { recoveryKeyText: recovery?.text };
}

/** Opens the server's recovery copy of the private key with the recovery key. */
export async function unlockWithRecoveryKey(
  session: Session,
  recoveryKeyText: string,
): Promise<UnlockedKeys> {
  const me = await session.call((api) => api.v1.me.get());
  if (me.keys === null) {
    throw new CliError("Your account has no keys yet.", { hint: "Run envy login to set them up." });
  }
  let recoveryKey: Uint8Array;
  try {
    recoveryKey = await parseRecoveryKey(recoveryKeyText);
  } catch (error) {
    if (error instanceof CryptoError) {
      throw new CliError(error.message, { hint: "Check each group of characters and try again." });
    }
    throw error;
  }
  try {
    const privateKey = await decryptPrivateKey(
      await fromBase64Url(me.keys.recoveryEncryptedPrivateKey),
      recoveryKey,
    ).catch(() => {
      throw new CliError("That recovery key does not open this account.", {
        exitCode: EXIT_CODES.authError,
        hint: "Use the recovery key shown when you first set up Envy, or the newest one since.",
      });
    });
    const publicKey = await getPublicKey(privateKey);
    // A server could send some other encrypted key; it must match the account's public key.
    if ((await toBase64Url(publicKey)) !== me.keys.publicKey) {
      throw new CliError("The server sent a key that is not this account's.", {
        exitCode: EXIT_CODES.authError,
        hint: "Do not continue. Check that ENVY_API_URL points at your real Envy server.",
      });
    }
    return { privateKey, publicKey };
  } finally {
    await clearKey(recoveryKey);
  }
}

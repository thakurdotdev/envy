import { fromBase64Url, makeKeyChallenge, toBase64Url } from "@envy/crypto";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import type { UserRow } from "../../db/schema.ts";
import type { UserActor as Actor } from "../auth/service.ts";
import { checkChallenge, signChallenge } from "./key-challenge.ts";
import type { UserKeyMaterial, UserRepository } from "./repository.ts";

export type ReplaceKeysInput = Omit<
  UserKeyMaterial,
  "publicKey" | "recoveryEncryptedPrivateKey"
> & {
  challengeToken: string;
  challengeAnswer: string;
  recoveryEncryptedPrivateKey?: string | undefined;
};

export function createUserService(dependencies: {
  users: UserRepository;
  /** Signs key challenges. JWT_SECRET; a separate key is derived from it. */
  challengeSecret: string;
  clock: Clock;
}) {
  const { users, challengeSecret, clock } = dependencies;

  async function getUser(actor: Actor): Promise<UserRow> {
    const user = await users.findById(actor.userId);
    if (user === undefined) {
      // The session exists but the user was deleted.
      throw new AppError("SESSION_REVOKED", "This account no longer exists.", 401);
    }
    return user;
  }

  return {
    async getProfile(actor: Actor) {
      return toProfile(await getUser(actor));
    },

    /** First setup only: key material cannot be replaced through this route. */
    async setKeys(actor: Actor, keys: UserKeyMaterial) {
      assertBase64UrlBytes(keys.publicKey, BYTE_SIZES.publicKey, "publicKey");
      assertBase64UrlBytes(keys.kdfSalt, BYTE_SIZES.salt, "kdfSalt");
      assertBase64UrlBytes(
        keys.encryptedPrivateKey,
        BYTE_SIZES.encryptedPrivateKey,
        "encryptedPrivateKey",
      );
      assertBase64UrlBytes(
        keys.recoveryEncryptedPrivateKey,
        BYTE_SIZES.encryptedPrivateKey,
        "recoveryEncryptedPrivateKey",
      );
      const saved = await users.setKeysIfEmpty(actor.userId, keys);
      if (!saved) {
        throw new AppError(
          "KEYS_ALREADY_SET",
          "This account already has keys. Unlock with your master password instead.",
          409,
        );
      }
      return toProfile(await getUser(actor));
    },

    /**
     * Step one of a new master password or recovery: random bytes sealed to
     * the account's public key, and a signed token to send back with them.
     */
    async startKeyChange(actor: Actor) {
      const user = await getUser(actor);
      if (user.publicKey === null) {
        throw new AppError("KEYS_NOT_SET", "This account has no keys yet.", 409);
      }
      const challenge = await makeKeyChallenge(await fromBase64Url(user.publicKey));
      return {
        sealedChallenge: await toBase64Url(challenge.sealed),
        challengeToken: signChallenge(challengeSecret, {
          userId: user.id,
          answer: challenge.answer,
          now: clock.now(),
        }),
      };
    },

    /**
     * Step two: the private key encrypted again (new password, and maybe a
     * new recovery key). Only a client that opened the challenge, and so
     * holds the private key, may do this: a stolen session alone could
     * otherwise lock the user out by storing junk.
     */
    async replaceKeys(actor: Actor, input: ReplaceKeysInput) {
      assertBase64UrlBytes(input.challengeAnswer, 32, "challengeAnswer");
      const isAnswered = checkChallenge(challengeSecret, input.challengeToken, {
        userId: actor.userId,
        answer: await fromBase64Url(input.challengeAnswer),
        now: clock.now(),
      });
      if (!isAnswered) {
        throw new AppError(
          "KEY_CHALLENGE_FAILED",
          "The key check failed or took too long. Start again.",
          403,
        );
      }
      assertBase64UrlBytes(input.kdfSalt, BYTE_SIZES.salt, "kdfSalt");
      assertBase64UrlBytes(
        input.encryptedPrivateKey,
        BYTE_SIZES.encryptedPrivateKey,
        "encryptedPrivateKey",
      );
      if (input.recoveryEncryptedPrivateKey !== undefined) {
        assertBase64UrlBytes(
          input.recoveryEncryptedPrivateKey,
          BYTE_SIZES.encryptedPrivateKey,
          "recoveryEncryptedPrivateKey",
        );
      }
      const saved = await users.replaceEncryptedPrivateKey(actor.userId, {
        encryptedPrivateKey: input.encryptedPrivateKey,
        kdfSalt: input.kdfSalt,
        kdfParams: input.kdfParams,
        recoveryEncryptedPrivateKey: input.recoveryEncryptedPrivateKey,
      });
      if (!saved) {
        throw new AppError("KEYS_NOT_SET", "This account has no keys yet.", 409);
      }
      return toProfile(await getUser(actor));
    },
  };
}

function toProfile(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    githubLogin: user.githubLogin,
    /** Null until the user sets a master password on their first device. */
    keys: readKeyMaterial(user),
  };
}

function readKeyMaterial(user: UserRow): UserKeyMaterial | null {
  const { publicKey, encryptedPrivateKey, recoveryEncryptedPrivateKey, kdfSalt, kdfParams } = user;
  if (
    publicKey === null ||
    encryptedPrivateKey === null ||
    recoveryEncryptedPrivateKey === null ||
    kdfSalt === null ||
    kdfParams === null
  ) {
    return null;
  }
  return { publicKey, encryptedPrivateKey, recoveryEncryptedPrivateKey, kdfSalt, kdfParams };
}

export type UserService = ReturnType<typeof createUserService>;

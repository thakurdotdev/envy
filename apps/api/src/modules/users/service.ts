import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import type { UserRow } from "../../db/schema.ts";
import type { UserActor as Actor } from "../auth/service.ts";
import type { UserKeyMaterial, UserRepository } from "./repository.ts";

export function createUserService(dependencies: { users: UserRepository }) {
  const { users } = dependencies;

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

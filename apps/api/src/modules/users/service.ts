import { base64UrlByteLength } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import type { UserRow } from "../../db/schema.ts";
import type { Actor } from "../auth/service.ts";
import type { UserKeyMaterial, UserRepository } from "./repository.ts";

// Sizes from packages/crypto format version 1. The API cannot decrypt
// anything, but it can refuse values that no client could have made.
const PUBLIC_KEY_BYTES = 32;
const SALT_BYTES = 16;
const ENCRYPTED_PRIVATE_KEY_BYTES = 1 + 24 + 32 + 16;

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
      assertByteLength(keys.publicKey, PUBLIC_KEY_BYTES, "publicKey");
      assertByteLength(keys.kdfSalt, SALT_BYTES, "kdfSalt");
      assertByteLength(
        keys.encryptedPrivateKey,
        ENCRYPTED_PRIVATE_KEY_BYTES,
        "encryptedPrivateKey",
      );
      assertByteLength(
        keys.recoveryEncryptedPrivateKey,
        ENCRYPTED_PRIVATE_KEY_BYTES,
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

function assertByteLength(value: string, expectedBytes: number, field: string): void {
  if (base64UrlByteLength(value) !== expectedBytes) {
    throw new AppError(
      "VALIDATION_FAILED",
      `The value of ${field} must be ${expectedBytes} bytes in base64url.`,
      400,
    );
  }
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

import { t } from "elysia";

const MEBIBYTE = 1024 * 1024;
const base64Url = (maxLength: number) =>
  t.String({ minLength: 1, maxLength, pattern: "^[A-Za-z0-9_-]+$" });

/**
 * Key material from the client's first setup. All of it is either public
 * (the public key, salt and settings) or encrypted on the client.
 */
const KdfParams = t.Object({
  algorithm: t.Literal("argon2id13"),
  opsLimit: t.Integer({ minimum: 3, maximum: 20 }),
  memLimitBytes: t.Integer({ minimum: 64 * MEBIBYTE, maximum: 1024 * MEBIBYTE }),
});

export const KeyMaterialBody = t.Object({
  publicKey: base64Url(100),
  encryptedPrivateKey: base64Url(200),
  recoveryEncryptedPrivateKey: base64Url(200),
  kdfSalt: base64Url(100),
  kdfParams: KdfParams,
});

/**
 * A new master password (or a new recovery key): the same private key,
 * encrypted again on the client. The public key never changes. The challenge
 * answer proves the client holds the private key.
 */
export const ReplaceKeysBody = t.Object(
  {
    challengeToken: t.String({ minLength: 1, maxLength: 400 }),
    challengeAnswer: base64Url(100),
    encryptedPrivateKey: base64Url(200),
    kdfSalt: base64Url(100),
    kdfParams: KdfParams,
    /** Sent when the recovery key was used up and a new one made. */
    recoveryEncryptedPrivateKey: t.Optional(base64Url(200)),
  },
  { additionalProperties: false },
);

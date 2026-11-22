import { t } from "elysia";

const MEBIBYTE = 1024 * 1024;
const base64Url = (maxLength: number) =>
  t.String({ minLength: 1, maxLength, pattern: "^[A-Za-z0-9_-]+$" });

/**
 * Key material from the client's first setup. All of it is either public
 * (the public key, salt and settings) or encrypted on the client.
 */
export const KeyMaterialBody = t.Object({
  publicKey: base64Url(100),
  encryptedPrivateKey: base64Url(200),
  recoveryEncryptedPrivateKey: base64Url(200),
  kdfSalt: base64Url(100),
  kdfParams: t.Object({
    algorithm: t.Literal("argon2id13"),
    opsLimit: t.Integer({ minimum: 3, maximum: 20 }),
    memLimitBytes: t.Integer({ minimum: 64 * MEBIBYTE, maximum: 1024 * MEBIBYTE }),
  }),
});

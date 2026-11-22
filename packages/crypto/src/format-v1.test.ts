import { describe, expect, test } from "bun:test";
import { fromBase64Url } from "./encoding.ts";
import { unwrapEnvKey } from "./env-keys.ts";
import { fingerprint } from "./fingerprint.ts";
import { DEFAULT_KDF_PARAMS, deriveMasterKey } from "./master-key.ts";
import { decryptSecrets } from "./secrets.ts";
import { decryptPrivateKey, getPublicKey } from "./user-keys.ts";

// Data written by format version 1, saved once and never regenerated. If a
// change to this package makes these fail, already-stored data would become
// unreadable: add a new format version instead of changing version 1.
// The keys below are made-up test values, not real secrets.

function fixedBytes(length: number, start: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (start + index) & 0xff);
}

const envKey = fixedBytes(32, 1);
const wrappingKey = fixedBytes(32, 101);
const memberPrivateKey = fixedBytes(32, 201);

const stored = {
  ciphertext: "AepTOr9UKNv8rk09oErCi3_I96uQQJpedxryy-H0fQruBhbgjg",
  nonce: "TwmOj-zWvXHxCTDdLBXfmpo-lL9XqQVi",
  encryptedPrivateKey:
    "AdnjKh6-tMZGckaW5JJeU4MfKodpiM_sSMOqO6ETas6MNx7M9_gl_8fpFcysmjuLjRVTQN89RQ8Fz1LGLaTlJlOICk8hM38v7A",
  wrappedEnvKey:
    "AZV1EEe1QWAguTDj89gv4LYkApkHMcH_Kf20bHgVerx980pZHW30atO5FGy5xu596ZosnoP9Ucy0XVUuSWQ_IakG9Xo2AjyDbu05_Bp027dT",
  fingerprint: "RZRZ QKPO 4Q3I BDFW",
  masterKey: "N49MpbfrLBs7aBRACey4S7JzIuRCBisX8ZHXqzMc5fE",
};

describe("format version 1 data stays readable", () => {
  test("secrets blob", async () => {
    const place = {
      projectId: "project-1",
      environmentId: "environment-1",
      version: 1,
      keyVersion: 1,
    };
    const encrypted = {
      ciphertext: await fromBase64Url(stored.ciphertext),
      nonce: await fromBase64Url(stored.nonce),
    };

    expect(await decryptSecrets(encrypted, envKey, place)).toEqual({ GREETING: "hello" });
  });

  test("encrypted private key", async () => {
    const encrypted = await fromBase64Url(stored.encryptedPrivateKey);

    expect(await decryptPrivateKey(encrypted, wrappingKey)).toEqual(memberPrivateKey);
  });

  test("wrapped environment key", async () => {
    const wrapped = await fromBase64Url(stored.wrappedEnvKey);

    expect(await unwrapEnvKey(wrapped, memberPrivateKey)).toEqual(envKey);
  });

  test("fingerprint", async () => {
    expect(await fingerprint(await getPublicKey(memberPrivateKey))).toBe(stored.fingerprint);
  });

  test("master key derivation", async () => {
    const masterKey = await deriveMasterKey(
      "test vector password",
      fixedBytes(16, 50),
      DEFAULT_KDF_PARAMS,
    );

    expect(masterKey).toEqual(await fromBase64Url(stored.masterKey));
  });
});

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// The server side of the proof that a client holds its private key (see
// packages/crypto/src/key-challenge.ts). Nothing is stored: the token carries
// who it is for, a hash of the answer and when it expires, signed with a key
// derived from JWT_SECRET so it cannot be made up or changed.

const LIFETIME_MS = 5 * 60 * 1000;
const PURPOSE = "envy/key-challenge/v1";

function signingKey(secret: string): Buffer {
  return createHmac("sha256", secret).update(PURPOSE).digest();
}

function hashAnswer(answer: Uint8Array): string {
  return createHash("sha256").update(answer).digest("hex");
}

function mac(secret: string, payload: string): Buffer {
  return createHmac("sha256", signingKey(secret)).update(payload).digest();
}

/** A token for one challenge, for one user, valid for 5 minutes. */
export function signChallenge(
  secret: string,
  input: { userId: string; answer: Uint8Array; now: Date },
): string {
  const payload = Buffer.from(
    JSON.stringify({
      userId: input.userId,
      answerHash: hashAnswer(input.answer),
      expiresAt: input.now.getTime() + LIFETIME_MS,
    }),
  ).toString("base64url");
  return `${payload}.${mac(secret, payload).toString("base64url")}`;
}

/** True when the token is genuine, for this user, not expired, and the answer matches. */
export function checkChallenge(
  secret: string,
  token: string,
  input: { userId: string; answer: Uint8Array; now: Date },
): boolean {
  const [payload, signature, ...rest] = token.split(".");
  if (payload === undefined || signature === undefined || rest.length > 0) {
    return false;
  }
  const expected = mac(secret, payload);
  const given = Buffer.from(signature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return false;
  }
  let claims: unknown;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  if (typeof claims !== "object" || claims === null) {
    return false;
  }
  const userId = "userId" in claims ? claims.userId : undefined;
  const answerHash = "answerHash" in claims ? claims.answerHash : undefined;
  const expiresAt = "expiresAt" in claims ? claims.expiresAt : undefined;
  if (userId !== input.userId || typeof expiresAt !== "number" || expiresAt < input.now.getTime()) {
    return false;
  }
  const expectedHash = Buffer.from(hashAnswer(input.answer), "hex");
  const givenHash = Buffer.from(typeof answerHash === "string" ? answerHash : "", "hex");
  return givenHash.length === expectedHash.length && timingSafeEqual(givenHash, expectedHash);
}

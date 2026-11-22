import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";

export const ACCESS_TOKEN_LIFETIME_SECONDS = 15 * 60;
export const REFRESH_TOKEN_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

const ISSUER = "envy-api";
const AUDIENCE = "envy";

export type AccessTokenClaims = { userId: string; sessionId: string };

export async function signAccessToken(
  claims: AccessTokenClaims,
  jwtSecret: string,
  clock: Clock,
): Promise<string> {
  const issuedAt = Math.floor(clock.now().getTime() / 1000);
  return new SignJWT({ sid: claims.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + ACCESS_TOKEN_LIFETIME_SECONDS)
    .sign(new TextEncoder().encode(jwtSecret));
}

export async function verifyAccessToken(
  token: string,
  jwtSecret: string,
  clock: Clock,
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: clock.now(),
    });
    const sessionId = payload["sid"];
    if (typeof payload.sub !== "string" || typeof sessionId !== "string") {
      throw new AppError("ACCESS_TOKEN_INVALID", "The access token is not valid.", 401);
    }
    return { userId: payload.sub, sessionId };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const message =
      error instanceof joseErrors.JWTExpired
        ? "The access token has expired. Refresh it and try again."
        : "The access token is not valid.";
    throw new AppError("ACCESS_TOKEN_INVALID", message, 401);
  }
}

// A refresh token is "<sessionId>.<32 random bytes>". The session id lets
// the server find the session even when an old (already rotated) token is
// used, which is how token theft is detected.
export function createRefreshToken(sessionId: string): string {
  return `${sessionId}.${randomBytes(32).toString("base64url")}`;
}

export function readSessionIdFromRefreshToken(refreshToken: string): string | undefined {
  const [sessionId, secretPart, extra] = refreshToken.split(".");
  if (!sessionId || !secretPart || extra !== undefined) {
    return undefined;
  }
  return sessionId;
}

// The token is long and random, so a fast hash is enough; a slow password
// hash would only add load.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashesMatch(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first);
  const secondBytes = Buffer.from(second);
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

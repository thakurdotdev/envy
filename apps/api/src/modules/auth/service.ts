import type { Config } from "../../config.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import type { UserRepository } from "../users/repository.ts";
import type { GitHubClient } from "./github.ts";
import type { SessionRepository } from "./repository.ts";
import {
  ACCESS_TOKEN_LIFETIME_SECONDS,
  createOAuthState,
  createRefreshToken,
  hashesMatch,
  hashToken,
  readSessionIdFromRefreshToken,
  REFRESH_TOKEN_LIFETIME_MS,
  signAccessToken,
  verifyAccessToken,
} from "./tokens.ts";

export type AuthServiceDependencies = {
  config: Pick<Config, "jwtSecret" | "apiUrl">;
  clock: Clock;
  github: GitHubClient;
  sessions: SessionRepository;
  users: UserRepository;
};

/** Who is making a request. Service tokens join this in Phase 7. */
export type Actor = { type: "user"; userId: string; sessionId: string };

export type SignedInSession = {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  userId: string;
};

export function webCallbackUrl(apiUrl: string): string {
  return `${apiUrl}/v1/auth/github/callback`;
}

export function createAuthService(dependencies: AuthServiceDependencies) {
  const { config, clock, github, sessions, users } = dependencies;

  async function createSignedInSession(
    githubAccessToken: string,
    client: "cli" | "web",
    deviceName: string,
  ): Promise<SignedInSession> {
    const profile = await github.getUser(githubAccessToken);
    const user = await users.upsertFromGitHub(profile);
    const now = clock.now();
    const sessionId = Bun.randomUUIDv7();
    const refreshToken = createRefreshToken(sessionId);
    await sessions.create({
      id: sessionId,
      userId: user.id,
      refreshTokenHash: hashToken(refreshToken),
      deviceName,
      client,
      expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
      lastUsedAt: now,
    });
    const accessToken = await signAccessToken(
      { userId: user.id, sessionId },
      config.jwtSecret,
      clock,
    );
    return {
      accessToken,
      accessTokenExpiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
      refreshToken,
      userId: user.id,
    };
  }

  // Someone used a refresh token that was already replaced. Either the
  // owner or a thief has an old copy, and we cannot tell which, so the
  // whole session is ended and the owner has to sign in again.
  async function revokeAfterReuse(sessionId: string): Promise<never> {
    await sessions.revoke(sessionId, clock.now());
    throw new AppError(
      "REFRESH_TOKEN_REUSED",
      "This sign-in was ended because an old refresh token was used. Sign in again.",
      401,
    );
  }

  return {
    startDeviceLogin: () => github.startDeviceFlow(),

    async pollDeviceLogin(deviceCode: string, deviceName: string) {
      const result = await github.pollDeviceFlow(deviceCode);
      if (result.status !== "complete") {
        return result;
      }
      const session = await createSignedInSession(result.githubAccessToken, "cli", deviceName);
      return { status: "complete" as const, ...session };
    },

    startWebLogin() {
      const state = createOAuthState();
      return { state, url: github.authorizeUrl(state, webCallbackUrl(config.apiUrl)) };
    },

    async completeWebLogin(input: {
      code: string;
      state: string;
      expectedState: string | undefined;
      deviceName: string;
    }): Promise<SignedInSession> {
      // The state value ties the callback to the browser that started the
      // sign-in, which stops another site from logging a user in as someone else.
      if (input.expectedState === undefined || !hashesMatch(input.state, input.expectedState)) {
        throw new AppError(
          "OAUTH_STATE_MISMATCH",
          "The sign-in link is old or was opened in another browser. Start the sign-in again.",
          400,
        );
      }
      const githubAccessToken = await github.exchangeWebCode(
        input.code,
        webCallbackUrl(config.apiUrl),
      );
      return createSignedInSession(githubAccessToken, "web", input.deviceName);
    },

    async refresh(refreshToken: string) {
      const invalid = new AppError(
        "REFRESH_TOKEN_INVALID",
        "Your sign-in has expired or is not valid. Sign in again.",
        401,
      );
      const sessionId = readSessionIdFromRefreshToken(refreshToken);
      const session = sessionId === undefined ? undefined : await sessions.findById(sessionId);
      if (session === undefined) {
        throw invalid;
      }
      if (session.revokedAt !== null) {
        throw new AppError("SESSION_REVOKED", "This sign-in was ended. Sign in again.", 401);
      }
      const now = clock.now();
      if (session.expiresAt <= now) {
        throw invalid;
      }

      const presentedHash = hashToken(refreshToken);
      if (!hashesMatch(presentedHash, session.refreshTokenHash)) {
        return revokeAfterReuse(session.id);
      }
      const nextRefreshToken = createRefreshToken(session.id);
      const rotated = await sessions.rotateRefreshToken({
        sessionId: session.id,
        oldHash: presentedHash,
        newHash: hashToken(nextRefreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS),
        usedAt: now,
      });
      if (!rotated) {
        // Another request rotated this token a moment ago: also a reuse.
        return revokeAfterReuse(session.id);
      }
      const accessToken = await signAccessToken(
        { userId: session.userId, sessionId: session.id },
        config.jwtSecret,
        clock,
      );
      return {
        accessToken,
        accessTokenExpiresIn: ACCESS_TOKEN_LIFETIME_SECONDS,
        refreshToken: nextRefreshToken,
      };
    },

    /** Checks the Authorization header and the session behind it. */
    async authenticate(authorizationHeader: string | undefined): Promise<Actor> {
      const token = authorizationHeader?.match(/^Bearer (\S+)$/)?.[1];
      if (token === undefined) {
        throw new AppError("NOT_AUTHENTICATED", "Sign in first.", 401);
      }
      const claims = await verifyAccessToken(token, config.jwtSecret, clock);
      const session = await sessions.findById(claims.sessionId);
      const isActive =
        session !== undefined &&
        session.userId === claims.userId &&
        session.revokedAt === null &&
        session.expiresAt > clock.now();
      if (!isActive) {
        throw new AppError("SESSION_REVOKED", "This sign-in was ended. Sign in again.", 401);
      }
      return { type: "user", userId: claims.userId, sessionId: claims.sessionId };
    },

    async logout(actor: Actor): Promise<void> {
      await sessions.revoke(actor.sessionId, clock.now());
    },

    async listSessions(actor: Actor) {
      const active = await sessions.listActiveForUser(actor.userId, clock.now());
      return active.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        client: session.client,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        isCurrent: session.id === actor.sessionId,
      }));
    },

    async revokeSession(actor: Actor, sessionId: string): Promise<void> {
      const session = await sessions.findById(sessionId);
      // Someone else's session looks exactly like a missing one.
      if (session === undefined || session.userId !== actor.userId || session.revokedAt !== null) {
        throw new AppError("SESSION_NOT_FOUND", "There is no such active session.", 404);
      }
      await sessions.revoke(sessionId, clock.now());
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;

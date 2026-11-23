import { Elysia } from "elysia";
import { servesOverHttps, type Config } from "../../config.ts";
import { authGuard, type Authenticate } from "../../lib/auth-guard.ts";
import { requireUser } from "../../lib/request-context.ts";
import { AppError } from "../../lib/errors.ts";
import { limitByIp } from "../../lib/rate-limit-hook.ts";
import type { RateLimiter } from "../../lib/rate-limit.ts";
import { DevicePollBody, RefreshBody, SessionIdParams, WebCallbackQuery } from "./schema.ts";
import type { AuthService } from "./service.ts";
import { REFRESH_TOKEN_LIFETIME_MS } from "./tokens.ts";

export const REFRESH_COOKIE = "envy_refresh";
const STATE_COOKIE = "envy_oauth_state";

export type AuthRateLimiters = {
  deviceStart: RateLimiter;
  devicePoll: RateLimiter;
  webLogin: RateLimiter;
  refresh: RateLimiter;
};

type AuthRoutesDependencies = {
  auth: AuthService;
  authenticate: Authenticate;
  writeLimiter: RateLimiter;
  config: Pick<Config, "environment" | "apiUrl" | "webUrl" | "trustedProxies">;
  rateLimiters: AuthRateLimiters;
};

export function authRoutes({
  auth,
  authenticate,
  writeLimiter,
  config,
  rateLimiters,
}: AuthRoutesDependencies) {
  const secure = servesOverHttps(config);
  const refreshCookie = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    // Sent only to the auth routes, never to the rest of the API.
    path: "/v1/auth",
    maxAge: REFRESH_TOKEN_LIFETIME_MS / 1000,
  };
  const stateCookie = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/v1/auth/github",
    maxAge: 10 * 60,
  };
  // A cookie is only deleted when the path matches, so expire it with the
  // same settings it was set with.
  const expired = { maxAge: 0, expires: new Date(0) };
  const limit = (limiter: RateLimiter, name: string) =>
    limitByIp(limiter, name, config.trustedProxies);
  const webOrigin = new URL(config.webUrl).origin;

  return (
    new Elysia()
      .post("/v1/auth/github/device", () => auth.startDeviceLogin(), {
        beforeHandle: limit(rateLimiters.deviceStart, "device-start"),
      })
      .post(
        "/v1/auth/github/device/poll",
        ({ body }) => auth.pollDeviceLogin(body.deviceCode, body.deviceName),
        { body: DevicePollBody, beforeHandle: limit(rateLimiters.devicePoll, "device-poll") },
      )
      .get(
        "/v1/auth/github/login",
        ({ cookie, redirect }) => {
          const { state, url } = auth.startWebLogin();
          cookie[STATE_COOKIE]?.set({ value: state, ...stateCookie });
          return redirect(url);
        },
        { beforeHandle: limit(rateLimiters.webLogin, "web-login") },
      )
      .get(
        "/v1/auth/github/callback",
        async ({ query, cookie, redirect }) => {
          const stateValue = cookie[STATE_COOKIE]?.value;
          const expectedState = typeof stateValue === "string" ? stateValue : undefined;
          cookie[STATE_COOKIE]?.set({ value: "", ...stateCookie, ...expired });
          try {
            if (
              query.error !== undefined ||
              query.code === undefined ||
              query.state === undefined
            ) {
              throw new AppError("GITHUB_LOGIN_FAILED", "GitHub sign-in was cancelled.", 400);
            }
            const session = await auth.completeWebLogin({
              code: query.code,
              state: query.state,
              expectedState,
              deviceName: "Web browser",
            });
            cookie[REFRESH_COOKIE]?.set({ value: session.refreshToken, ...refreshCookie });
            return redirect(`${config.webUrl}/projects`);
          } catch (error) {
            // The browser is mid-redirect, so send it back to the dashboard
            // with the error code instead of showing raw JSON.
            const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
            return redirect(`${config.webUrl}/login?error=${code}`);
          }
        },
        { query: WebCallbackQuery, beforeHandle: limit(rateLimiters.webLogin, "web-login") },
      )
      .post(
        "/v1/auth/refresh",
        async ({ body, cookie, headers }) => {
          const fromBody = body?.refreshToken;
          const cookieValue = cookie[REFRESH_COOKIE]?.value;
          const fromCookie = typeof cookieValue === "string" ? cookieValue : undefined;
          const refreshToken = fromBody ?? fromCookie;
          if (refreshToken === undefined) {
            throw new AppError("NOT_AUTHENTICATED", "Sign in first.", 401);
          }
          // The browser adds the cookie to any request, even one started by
          // another site, so a cookie refresh must come from the dashboard.
          if (fromBody === undefined && headers["origin"] !== webOrigin) {
            throw new AppError(
              "FORBIDDEN",
              "Refreshing with the cookie only works from the Envy dashboard.",
              403,
            );
          }
          const result = await auth.refresh(refreshToken);
          if (fromBody === undefined) {
            // Web: the new token goes back in the cookie, never into page JavaScript.
            cookie[REFRESH_COOKIE]?.set({ value: result.refreshToken, ...refreshCookie });
            return {
              accessToken: result.accessToken,
              accessTokenExpiresIn: result.accessTokenExpiresIn,
            };
          }
          return result;
        },
        { body: RefreshBody, beforeHandle: limit(rateLimiters.refresh, "refresh") },
      )
      // Everything below needs a signed-in user.
      .use(authGuard(authenticate, config.trustedProxies, writeLimiter))
      .post("/v1/auth/logout", async ({ actor, cookie, set }) => {
        await auth.logout(requireUser(actor));
        cookie[REFRESH_COOKIE]?.set({ value: "", ...refreshCookie, ...expired });
        set.status = 204;
      })
      .get("/v1/me/sessions", async ({ actor }) => ({
        items: await auth.listSessions(requireUser(actor)),
      }))
      .delete(
        "/v1/me/sessions/:id",
        async ({ actor, params, set }) => {
          await auth.revokeSession(requireUser(actor), params.id);
          set.status = 204;
        },
        { params: SessionIdParams },
      )
  );
}

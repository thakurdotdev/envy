import { treaty, type Treaty } from "@elysiajs/eden";
// Type only: the dashboard never bundles the API's code, just its route types.
import type { App } from "@envy/api";

/**
 * The typed API client for the dashboard. The refresh token travels in an
 * httpOnly cookie, so requests include credentials; the access token is
 * kept in memory only. Phase 6 adds automatic refresh.
 */
export function createApiClient(
  baseUrl: string,
  getAccessToken: () => string | undefined,
): Treaty.Create<App> {
  return treaty<App>(baseUrl, {
    fetch: { credentials: "include" },
    headers() {
      const accessToken = getAccessToken();
      return accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` };
    },
  });
}

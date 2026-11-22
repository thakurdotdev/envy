import { treaty, type Treaty } from "@elysiajs/eden";
// Type only: the CLI never bundles the API's code, just its route types.
import type { App } from "@envy/api";

/**
 * The typed API client. Phase 4 wraps it to refresh expired access tokens
 * and turn error responses into the shared error codes.
 */
export function createApiClient(
  baseUrl: string,
  getAccessToken: () => string | undefined,
): Treaty.Create<App> {
  return treaty<App>(baseUrl, {
    headers() {
      const accessToken = getAccessToken();
      return accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` };
    },
  });
}

export type ApiClient = ReturnType<typeof createApiClient>;

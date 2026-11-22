import type { Server } from "bun";

/**
 * Finds the address the request came from. X-Forwarded-For is only trusted
 * when the API runs behind a proxy (TRUST_PROXY=true); otherwise anyone
 * could pick their own IP and dodge rate limits.
 */
export function getClientIp(
  request: Request,
  server: Server<unknown> | null,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const firstAddress = forwardedFor?.split(",")[0]?.trim();
    if (firstAddress) {
      return firstAddress;
    }
  }
  return server?.requestIP(request)?.address ?? "unknown";
}

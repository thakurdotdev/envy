import type { Server } from "bun";

/**
 * Finds the address the request came from. X-Forwarded-For is only trusted
 * when the API runs behind a proxy (TRUST_PROXY=true); otherwise anyone
 * could pick their own IP and dodge rate limits.
 *
 * Behind a proxy the last address is used, not the first: the proxy adds
 * the address it saw to the end of the header, while everything before it
 * was sent by the client and can be made up.
 */
export function getClientIp(
  request: Request,
  server: Server<unknown> | null,
  trustProxy: boolean,
): string {
  if (trustProxy) {
    const forwardedFor = request.headers.get("x-forwarded-for");
    const lastAddress = forwardedFor?.split(",").at(-1)?.trim();
    if (lastAddress) {
      return lastAddress;
    }
  }
  return server?.requestIP(request)?.address ?? "unknown";
}

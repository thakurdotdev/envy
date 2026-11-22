import type { Server } from "bun";

/**
 * Finds the address the request came from.
 *
 * `trustedProxies` is how many proxies in front of the API add an address to
 * the end of X-Forwarded-For (TRUST_PROXY). Each one appends the address it
 * saw, so with Cloudflare then nginx the header ends "<client>, <cloudflare>"
 * and the client is the second address from the right. Anything further left
 * was sent by the client itself and could be made up to dodge rate limits.
 * With 0, the header is ignored and the connection's own address is used.
 */
export function getClientIp(
  request: Request,
  server: Server<unknown> | null,
  trustedProxies: number,
): string {
  if (trustedProxies > 0) {
    const addresses = (request.headers.get("x-forwarded-for") ?? "")
      .split(",")
      .map((address) => address.trim())
      .filter((address) => address !== "");
    // Fewer entries than proxies: the request skipped one, so take the leftmost there is.
    const client = addresses.at(-trustedProxies) ?? addresses[0];
    if (client !== undefined) {
      return withoutIpv4Prefix(client);
    }
  }
  const connection = server?.requestIP(request)?.address;
  return connection === undefined ? "unknown" : withoutIpv4Prefix(connection);
}

// A server listening on IPv6 sees IPv4 clients as "::ffff:1.2.3.4" (an
// IPv4-mapped address). Store the plain "1.2.3.4" so the audit log and the
// rate limits see one form for one client.
const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function withoutIpv4Prefix(address: string): string {
  return IPV4_MAPPED.exec(address)?.[1] ?? address;
}

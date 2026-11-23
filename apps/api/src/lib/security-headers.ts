import { Elysia } from "elysia";

/**
 * Headers that make browsers treat API responses as plain data: never
 * framed, never sniffed as HTML, never sent a referrer, and (when served over
 * HTTPS) only ever loaded over HTTPS.
 */
export function securityHeaders(useHttpsOnly: boolean) {
  return new Elysia({ name: "security-headers" }).onRequest(({ set }) => {
    set.headers["x-content-type-options"] = "nosniff";
    set.headers["x-frame-options"] = "DENY";
    set.headers["referrer-policy"] = "no-referrer";
    set.headers["content-security-policy"] = "default-src 'none'; frame-ancestors 'none'";
    set.headers["cross-origin-resource-policy"] = "same-site";
    set.headers["cache-control"] = "no-store";
    if (useHttpsOnly) {
      set.headers["strict-transport-security"] = "max-age=63072000; includeSubDomains";
    }
  });
}

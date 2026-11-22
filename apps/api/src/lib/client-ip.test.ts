import { describe, expect, test } from "bun:test";
import { getClientIp } from "./client-ip.ts";

function requestWith(forwardedFor: string | undefined): Request {
  const headers = forwardedFor === undefined ? undefined : { "x-forwarded-for": forwardedFor };
  return new Request("http://api.test/", { headers });
}

describe("getClientIp", () => {
  test("behind Cloudflare and nginx, the client is the second address from the right", () => {
    // Cloudflare appends the client, nginx appends Cloudflare's edge.
    expect(getClientIp(requestWith("198.51.100.7, 172.70.1.1"), null, 2)).toBe("198.51.100.7");
    // Whatever the client made up comes before them and is ignored.
    expect(getClientIp(requestWith("6.6.6.6, 198.51.100.7, 172.70.1.1"), null, 2)).toBe(
      "198.51.100.7",
    );
  });

  test("with one proxy the last address counts; with none the header is ignored", () => {
    expect(getClientIp(requestWith("6.6.6.6, 198.51.100.7"), null, 1)).toBe("198.51.100.7");
    expect(getClientIp(requestWith("6.6.6.6"), null, 0)).toBe("unknown");
  });

  test("a request that skipped a proxy falls back to the leftmost address", () => {
    expect(getClientIp(requestWith("203.0.113.9"), null, 2)).toBe("203.0.113.9");
    expect(getClientIp(requestWith(undefined), null, 2)).toBe("unknown");
  });
});

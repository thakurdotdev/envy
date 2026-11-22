import { describe, expect, test } from "bun:test";
import { fromBase32, fromBase64Url, toBase32, toBase64Url } from "./encoding.ts";
import { expectCryptoError } from "./test/expect-crypto-error.ts";

describe("base64url", () => {
  test("round trip, URL-safe and without padding", async () => {
    const bytes = Uint8Array.from([0xfb, 0xff, 0xbf, 0x00, 0x01]);

    const text = await toBase64Url(bytes);

    expect(text).toBe("-_-_AAE");
    expect(await fromBase64Url(text)).toEqual(bytes);
  });

  test("rejects text that is not base64url", async () => {
    await expectCryptoError(fromBase64Url("not base64!"), "INVALID_INPUT");
  });
});

describe("base32", () => {
  test("matches the RFC 4648 test vectors", () => {
    const vectors: Array<[string, string]> = [
      ["", ""],
      ["f", "MY"],
      ["fo", "MZXQ"],
      ["foo", "MZXW6"],
      ["foob", "MZXW6YQ"],
      ["fooba", "MZXW6YTB"],
      ["foobar", "MZXW6YTBOI"],
    ];

    for (const [input, expected] of vectors) {
      const bytes = new TextEncoder().encode(input);
      expect(toBase32(bytes)).toBe(expected);
      expect(fromBase32(expected)).toEqual(bytes);
    }
  });

  test("returns undefined for characters outside the alphabet", () => {
    expect(fromBase32("MZXW1")).toBeUndefined();
  });
});

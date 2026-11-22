const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/**
 * How many bytes a base64url string holds, or undefined if it is not valid
 * base64url without padding. Used to check key sizes the API never decrypts.
 */
export function base64UrlByteLength(value: string): number | undefined {
  if (!BASE64URL_PATTERN.test(value) || value.length % 4 === 1) {
    return undefined;
  }
  const bytes = Buffer.from(value, "base64url");
  // Reject strings with leftover bits, so each value has exactly one spelling.
  if (bytes.toString("base64url") !== value) {
    return undefined;
  }
  return bytes.length;
}

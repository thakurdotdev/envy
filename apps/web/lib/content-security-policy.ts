// The Content-Security-Policy for each half of the site, as a <meta> tag so the
// pages stay protected even when the host adds no headers. Only in builds:
// `next dev` needs eval.
//
// The dashboard and the public pages get different policies, and links between
// the two are plain <a> links, so each loads as a fresh page with only its own
// policy and scripts.

const apiOrigin = new URL(process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3000").origin;

/** Umami, self-hosted. Only the public pages load it. */
export const ANALYTICS_ORIGIN = "https://analytics.thakur.dev";
export const ANALYTICS_WEBSITE_ID = "67b6d992-f2da-46f9-904b-43ec0114349e";
/** Umami ignores page views from any other host, so local and test builds send none. */
export const ANALYTICS_DOMAIN = "envy.thakur.dev";

export const isProductionBuild = process.env.NODE_ENV === "production";

function policy(directives: string[]): string {
  return directives.join("; ");
}

/**
 * The dashboard decrypts secrets in the page, so scripts may only talk to this
 * site and the API: injected code could not send values anywhere else. No
 * third-party scripts at all. 'wasm-unsafe-eval' lets libsodium run as
 * WebAssembly.
 */
export const DASHBOARD_POLICY = policy([
  "default-src 'self'",
  `connect-src 'self' ${apiOrigin}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "object-src 'none'",
  "base-uri 'none'",
  `form-action 'self' ${apiOrigin}`,
]);

/** The landing page and docs hold no secrets; they also allow the analytics script. */
export const PUBLIC_POLICY = policy([
  "default-src 'self'",
  `connect-src 'self' ${ANALYTICS_ORIGIN}`,
  "img-src 'self' data:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  `script-src 'self' 'unsafe-inline' ${ANALYTICS_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
]);

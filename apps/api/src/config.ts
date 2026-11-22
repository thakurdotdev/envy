// Reads and checks every setting the API needs when it starts. A missing or
// bad value stops the server with a list of every problem, instead of
// failing later in the middle of a request.

export type Config = {
  /** "production" turns on secure cookies. */
  environment: "development" | "test" | "production";
  port: number;
  databaseUrl: string;
  /** Public address of this API, used to build the GitHub callback URL. */
  apiUrl: string;
  /** Address of the web dashboard: the CORS allow-list and the redirect after web sign-in. */
  webUrl: string;
  /** Signs access tokens. At least 32 characters of random text. */
  jwtSecret: string;
  githubClientId: string;
  githubClientSecret: string;
  /**
   * How many proxies in front of the API append to X-Forwarded-For (0 = trust
   * none). See lib/client-ip.ts and docs/deploy.md.
   */
  trustedProxies: number;
};

export class ConfigError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(
      `The API settings are not valid:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`,
    );
    this.name = "ConfigError";
    this.problems = problems;
  }
}

type Environment = Record<string, string | undefined>;

export function loadConfig(environment: Environment): Config {
  const problems: string[] = [];
  const read = createReader(environment, problems);

  const config: Config = {
    environment: read.oneOf("APP_ENV", ["development", "test", "production"], "development"),
    port: read.port("PORT", 3000),
    databaseUrl: read.url("DATABASE_URL", ["postgres:", "postgresql:"]),
    apiUrl: read.url("API_URL", ["http:", "https:"]),
    webUrl: read.url("WEB_URL", ["http:", "https:"]),
    jwtSecret: read.secret("JWT_SECRET", 32),
    githubClientId: read.text("GITHUB_CLIENT_ID"),
    githubClientSecret: read.text("GITHUB_CLIENT_SECRET"),
    trustedProxies: read.proxyCount("TRUST_PROXY"),
  };

  if (config.environment === "production") {
    // Tokens and cookies cross these addresses, so production must not use plain HTTP.
    for (const [name, value] of [
      ["API_URL", config.apiUrl],
      ["WEB_URL", config.webUrl],
    ] as const) {
      if (value.startsWith("http:")) {
        problems.push(`${name} must start with https:// when APP_ENV=production.`);
      }
    }
  }

  if (problems.length > 0) {
    throw new ConfigError(problems);
  }
  return config;
}

/**
 * Settings that work but are probably a mistake. The server still starts, so
 * a deploy is never stopped by them; they are logged as warnings at boot.
 */
export function configWarnings(config: Config): string[] {
  const warnings: string[] = [];
  if (config.environment === "production" && config.trustedProxies === 0) {
    // Production needs https, so a proxy almost always sits in front. With
    // TRUST_PROXY=0 every request seems to come from that proxy: the audit log
    // shows its address (often 127.0.0.1) and all users share one rate limit.
    warnings.push(
      "TRUST_PROXY is 0, so client addresses are the proxy's own. Set TRUST_PROXY to the number of proxies in front of the API (see docs/deploy.md).",
    );
  }
  return warnings;
}

function createReader(environment: Environment, problems: string[]) {
  function readRaw(name: string): string | undefined {
    const value = environment[name]?.trim();
    return value === "" ? undefined : value;
  }

  function text(name: string): string {
    const value = readRaw(name);
    if (value === undefined) {
      problems.push(`${name} is missing.`);
      return "";
    }
    return value;
  }

  function secret(name: string, minimumLength: number): string {
    const value = text(name);
    if (value !== "" && value.length < minimumLength) {
      // Never include the value itself: this message is printed.
      problems.push(`${name} must be at least ${minimumLength} characters long.`);
    }
    return value;
  }

  function url(name: string, allowedProtocols: string[]): string {
    const value = text(name);
    if (value === "") {
      return value;
    }
    const parsed = URL.parse(value);
    if (parsed === null || !allowedProtocols.includes(parsed.protocol)) {
      problems.push(`${name} must be a URL starting with ${allowedProtocols.join(" or ")}//.`);
      return value;
    }
    // Stored without a trailing slash so paths can be added with `${url}/path`.
    return value.replace(/\/+$/, "");
  }

  function port(name: string, fallback: number): number {
    const value = readRaw(name);
    if (value === undefined) {
      return fallback;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1 || number > 65_535) {
      problems.push(`${name} must be a whole number from 1 to 65535.`);
      return fallback;
    }
    return number;
  }

  // "false" and "true" still work: they mean 0 and 1 proxies.
  function proxyCount(name: string): number {
    const value = readRaw(name);
    if (value === undefined || value === "false") {
      return 0;
    }
    if (value === "true") {
      return 1;
    }
    const count = Number(value);
    if (!Number.isInteger(count) || count < 0 || count > 5) {
      problems.push(`${name} must be how many proxies are in front of the API (0 to 5).`);
      return 0;
    }
    return count;
  }

  function oneOf<Option extends string>(name: string, options: Option[], fallback: Option): Option {
    const value = readRaw(name);
    if (value === undefined) {
      return fallback;
    }
    const match = options.find((option) => option === value);
    if (match === undefined) {
      problems.push(`${name} must be one of: ${options.join(", ")}.`);
      return fallback;
    }
    return match;
  }

  return { text, secret, url, port, proxyCount, oneOf };
}

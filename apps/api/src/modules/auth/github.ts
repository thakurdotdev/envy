import { AppError } from "../../lib/errors.ts";

// Talks to GitHub for sign-in. Behind an interface so tests can use a fake.

export type GitHubUser = {
  githubId: number;
  login: string;
  name: string | null;
  email: string;
};

export type DeviceCodeResponse = {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  expiresInSeconds: number;
  intervalSeconds: number;
};

export type DevicePollResponse =
  | { status: "pending" }
  | { status: "slow_down"; intervalSeconds: number }
  | { status: "complete"; githubAccessToken: string };

export type GitHubClient = {
  startDeviceFlow(): Promise<DeviceCodeResponse>;
  pollDeviceFlow(deviceCode: string): Promise<DevicePollResponse>;
  authorizeUrl(state: string, redirectUri: string): string;
  exchangeWebCode(code: string, redirectUri: string): Promise<string>;
  getUser(githubAccessToken: string): Promise<GitHubUser>;
};

const SCOPES = "read:user user:email";
const OAUTH_URL = "https://github.com/login";
const API_URL = "https://api.github.com";

type GitHubClientOptions = {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
};

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const fetchFromGitHub = options.fetch ?? fetch;

  async function postForm(path: string, fields: Record<string, string>): Promise<unknown> {
    const response = await fetchFromGitHub(`${OAUTH_URL}${path}`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: new URLSearchParams(fields),
    });
    if (!response.ok) {
      throw loginFailed();
    }
    return response.json();
  }

  async function getJson(path: string, githubAccessToken: string): Promise<unknown> {
    const response = await fetchFromGitHub(`${API_URL}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubAccessToken}`,
        "User-Agent": "envy-api",
      },
    });
    if (!response.ok) {
      throw loginFailed();
    }
    return response.json();
  }

  return {
    async startDeviceFlow() {
      const body = asRecord(
        await postForm("/device/code", { client_id: options.clientId, scope: SCOPES }),
      );
      return {
        deviceCode: readString(body, "device_code"),
        userCode: readString(body, "user_code"),
        verificationUri: readString(body, "verification_uri"),
        expiresInSeconds: readNumber(body, "expires_in"),
        intervalSeconds: readNumber(body, "interval"),
      };
    },

    async pollDeviceFlow(deviceCode) {
      const body = asRecord(
        await postForm("/oauth/access_token", {
          client_id: options.clientId,
          device_code: deviceCode,
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        }),
      );
      return readDevicePollResponse(body);
    },

    authorizeUrl(state, redirectUri) {
      const url = new URL(`${OAUTH_URL}/oauth/authorize`);
      url.searchParams.set("client_id", options.clientId);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("scope", SCOPES);
      url.searchParams.set("state", state);
      return url.toString();
    },

    async exchangeWebCode(code, redirectUri) {
      const body = asRecord(
        await postForm("/oauth/access_token", {
          client_id: options.clientId,
          client_secret: options.clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      );
      return readString(body, "access_token");
    },

    async getUser(githubAccessToken) {
      const profile = asRecord(await getJson("/user", githubAccessToken));
      const emails = await getJson("/user/emails", githubAccessToken);
      return {
        githubId: readNumber(profile, "id"),
        login: readString(profile, "login"),
        name: typeof profile["name"] === "string" ? profile["name"] : null,
        email: findPrimaryEmail(emails),
      };
    },
  };
}

function readDevicePollResponse(body: Record<string, unknown>): DevicePollResponse {
  if (typeof body["access_token"] === "string") {
    return { status: "complete", githubAccessToken: body["access_token"] };
  }
  switch (body["error"]) {
    case "authorization_pending":
      return { status: "pending" };
    case "slow_down":
      return { status: "slow_down", intervalSeconds: readNumber(body, "interval") };
    case "expired_token":
      throw new AppError(
        "DEVICE_CODE_EXPIRED",
        "The sign-in code expired before it was approved. Start the sign-in again.",
        400,
      );
    case "access_denied":
      throw new AppError("DEVICE_ACCESS_DENIED", "The sign-in was cancelled on GitHub.", 400);
    default:
      throw loginFailed();
  }
}

function findPrimaryEmail(emails: unknown): string {
  if (Array.isArray(emails)) {
    for (const entry of emails) {
      const email = asRecord(entry);
      if (
        email["primary"] === true &&
        email["verified"] === true &&
        typeof email["email"] === "string"
      ) {
        return email["email"];
      }
    }
  }
  throw new AppError(
    "GITHUB_EMAIL_MISSING",
    "Your GitHub account has no verified primary email. Add one on GitHub and sign in again.",
    400,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw loginFailed();
  }
  return Object.fromEntries(Object.entries(value));
}

function readString(body: Record<string, unknown>, name: string): string {
  const value = body[name];
  if (typeof value !== "string") {
    throw loginFailed();
  }
  return value;
}

function readNumber(body: Record<string, unknown>, name: string): number {
  const value = body[name];
  if (typeof value !== "number") {
    throw loginFailed();
  }
  return value;
}

function loginFailed(): AppError {
  return new AppError(
    "GITHUB_LOGIN_FAILED",
    "GitHub sign-in did not work. Try again in a moment.",
    502,
  );
}

import type { GitHubClient, GitHubUser } from "../modules/auth/github.ts";

/** A stand-in for GitHub. Tests decide who signs in and when. */
export function createFakeGitHub() {
  const approvedDevices = new Map<string, GitHubUser>();
  const webCodes = new Map<string, GitHubUser>();
  const usersByToken = new Map<string, GitHubUser>();
  let counter = 0;

  function issueToken(user: GitHubUser): string {
    counter += 1;
    const token = `github-token-${counter}`;
    usersByToken.set(token, user);
    return token;
  }

  const client: GitHubClient = {
    async startDeviceFlow() {
      counter += 1;
      return {
        deviceCode: `device-code-${counter}`,
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
        expiresInSeconds: 900,
        intervalSeconds: 5,
      };
    },
    async pollDeviceFlow(deviceCode) {
      const user = approvedDevices.get(deviceCode);
      if (user === undefined) {
        return { status: "pending" };
      }
      approvedDevices.delete(deviceCode);
      return { status: "complete", githubAccessToken: issueToken(user) };
    },
    authorizeUrl(state, redirectUri) {
      const url = new URL("https://github.test/login/oauth/authorize");
      url.searchParams.set("state", state);
      url.searchParams.set("redirect_uri", redirectUri);
      return url.toString();
    },
    async exchangeWebCode(code) {
      const user = webCodes.get(code);
      if (user === undefined) {
        throw new Error("unknown code");
      }
      return issueToken(user);
    },
    async getUser(githubAccessToken) {
      const user = usersByToken.get(githubAccessToken);
      if (user === undefined) {
        throw new Error("unknown token");
      }
      return user;
    },
  };

  return {
    client,
    /** The user approves the device code on github.com. */
    approveDevice: (deviceCode: string, user: GitHubUser) => approvedDevices.set(deviceCode, user),
    /** GitHub will accept this code at the web callback. */
    allowWebCode: (code: string, user: GitHubUser) => webCodes.set(code, user),
  };
}

let nextGitHubId = 1000;

export function makeGitHubUser(login: string): GitHubUser {
  nextGitHubId += 1;
  return { githubId: nextGitHubId, login, name: login, email: `${login}@example.invalid` };
}

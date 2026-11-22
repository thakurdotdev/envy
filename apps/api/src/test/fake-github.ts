import type { GitHubClient, GitHubUser } from "../modules/auth/github.ts";

/** A stand-in for GitHub. Tests decide who signs in and when. */
export function createFakeGitHub() {
  const approvedDevices = new Map<string, GitHubUser>();
  // When set, every device code is approved for this user straight away
  // (for end-to-end tests where nobody can click "Authorize").
  let autoApproveUser: GitHubUser | undefined;
  let intervalSeconds = 5;
  // Where the browser is sent to "approve" a web sign-in. Browser tests point
  // this at a page they serve, which sends the browser straight back.
  let authorizeBaseUrl = "https://github.test/login/oauth/authorize";
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
        intervalSeconds,
      };
    },
    async pollDeviceFlow(deviceCode) {
      const user = approvedDevices.get(deviceCode) ?? autoApproveUser;
      if (user === undefined) {
        return { status: "pending" };
      }
      approvedDevices.delete(deviceCode);
      return { status: "complete", githubAccessToken: issueToken(user) };
    },
    authorizeUrl(state, redirectUri) {
      const url = new URL(authorizeBaseUrl);
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
    /** Approves every future device sign-in for this user, with no polling wait. */
    autoApproveDevices(user: GitHubUser) {
      autoApproveUser = user;
      intervalSeconds = 0;
    },
    /** Sends web sign-ins to this page instead of github.com. */
    setAuthorizeUrl(url: string) {
      authorizeBaseUrl = url;
    },
    /** GitHub will accept this code at the web callback. */
    allowWebCode: (code: string, user: GitHubUser) => webCodes.set(code, user),
  };
}

let nextGitHubId = 1000;

export function makeGitHubUser(login: string): GitHubUser {
  nextGitHubId += 1;
  return { githubId: nextGitHubId, login, name: login, email: `${login}@example.invalid` };
}

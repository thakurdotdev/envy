import type { App } from "@envy/api";
import { treaty } from "@elysiajs/eden";
import { fromBase64Url, getPublicKey } from "@envy/crypto";
import { join } from "node:path";
import type { ProjectContext } from "./context.ts";
import { CliError, EXIT_CODES } from "./errors.ts";
import { findProjectLink, LINK_FILE_NAME } from "./project-link.ts";
import { callApi, type ApiCaller } from "./session.ts";
import { resolveApiUrl } from "./settings.ts";

// A service token is `envy_<tokenId>_<privateKey>`. Only `envy_<tokenId>`
// is ever sent to the API; the private key part stays here and opens the
// one environment the token was made for.

const TOKEN_PATTERN = /^envy_([0-9a-f]{48})_([A-Za-z0-9_-]{43})$/;

export type ServiceToken = { tokenId: string; privateKey: string };

export function parseServiceToken(text: string): ServiceToken {
  const match = TOKEN_PATTERN.exec(text.trim());
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new CliError("ENVY_TOKEN is not a valid Envy service token.", {
      exitCode: EXIT_CODES.authError,
      hint: "Copy the whole token shown by envy token create.",
    });
  }
  return { tokenId: match[1], privateKey: match[2] };
}

export function readServiceToken(): ServiceToken | undefined {
  const value = process.env["ENVY_TOKEN"];
  return value ? parseServiceToken(value) : undefined;
}

export function createTokenCaller(apiUrl: string, token: ServiceToken): ApiCaller {
  const api = treaty<App>(apiUrl, { headers: { authorization: `Bearer envy_${token.tokenId}` } });
  return { call: (request) => callApi(() => request(api)) };
}

/** The context for `run`, `pull` and `get` when ENVY_TOKEN is set. */
export async function openTokenContext(
  token: ServiceToken,
  requestedEnvironment: string | undefined,
): Promise<ProjectContext> {
  const caller = createTokenCaller(await resolveApiUrl(), token);
  const current = await caller.call((api) => api.v1.tokens.current.get());
  const environment = current.environment;
  if (requestedEnvironment !== undefined && requestedEnvironment !== environment.name) {
    throw new CliError(`This token only reads ${environment.name}, not ${requestedEnvironment}.`, {
      hint: `Create a token for ${requestedEnvironment} with envy token create --env ${requestedEnvironment}.`,
    });
  }
  // .envy.json is optional with a token: the token already names the project.
  const linked = await findProjectLink();
  const folder = linked?.folder ?? process.cwd();
  const found = {
    folder,
    path: linked?.path ?? join(folder, LINK_FILE_NAME),
    link: {
      projectId: current.projectId,
      defaultEnvironment: environment.name,
      file: linked?.link.file ?? ".env",
      branches: {},
    },
  };
  const privateKey = await fromBase64Url(token.privateKey);
  const keys = { privateKey, publicKey: await getPublicKey(privateKey) };
  return {
    found,
    session: caller,
    environments: [environment],
    environment,
    // A token reads exactly one environment, so the shared layer is not merged in.
    sharedEnvironment: undefined,
    unlock: async () => keys,
  };
}

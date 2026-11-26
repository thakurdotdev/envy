import type { App } from "@envy/api";
import { treaty } from "@elysiajs/eden";
import { fromBase64Url, getPublicKey } from "@envy/crypto";
import { join } from "node:path";
import type { EnvironmentOptions, ProjectContext } from "./context.ts";
import { CliError, EXIT_CODES } from "./errors.ts";
import { findProjectLink, LINK_FILE_NAME } from "./project-link.ts";
import { callApi, type ApiCaller } from "./session.ts";
import { chooseTarget } from "./targets.ts";
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
  options: EnvironmentOptions,
): Promise<ProjectContext> {
  const caller = createTokenCaller(await resolveApiUrl(), token);
  const current = await caller.call((api) => api.v1.tokens.current.get());
  const environment = current.environment;
  if (options.env !== undefined && options.env !== environment.name) {
    throw new CliError(`This token only reads ${environment.name}, not ${options.env}.`, {
      hint: `Create a token for ${options.env} with envy token create --env ${options.env}.`,
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
      apps: linked?.link.apps ?? {},
    },
  };
  // The folder decides which file `envy pull` writes; the token decides what it reads.
  const target = chooseTarget(found, options.app);
  // Tokens made before apps existed (or by an older envy) read no layers (ADR 0018).
  const layers = (current.layers ?? []).filter((layer) => layer.isShared || target.inheritRoot);
  const privateKey = await fromBase64Url(token.privateKey);
  const keys = { privateKey, publicKey: await getPublicKey(privateKey) };
  return {
    found,
    session: caller,
    environments: [...layers, environment],
    appIds: new Map(),
    target,
    environment,
    layers,
    unlock: async () => keys,
    canUnlockWithoutAsking: true,
  };
}

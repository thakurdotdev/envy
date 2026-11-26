import { clearKey, generateUserKeys, toBase64Url } from "@envy/crypto";
import { createHash, randomBytes } from "node:crypto";
import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { requireProjectLink } from "../core/project-link.ts";
import { openSession } from "../core/session.ts";
import { fetchEnvKey, wrapEnvKeyFor } from "../core/env-keys.ts";
import { tokenKeyOwner } from "../core/team.ts";
import { pinConfirmedPublicKeys } from "../core/trust.ts";
import { layersUnder } from "@envy/shared";
import { listApps } from "../core/secrets.ts";
import { environmentLabel } from "../core/targets.ts";
import { output } from "../ui/output.ts";

export type CreateTokenOptions = EnvironmentOptions & { name?: string; expires?: string };

/**
 * Makes a read-only service token for one environment. The token's keypair
 * and id are made here; the API only gets the public key, the environment
 * key wrapped for it, and a hash of the id. The token is printed once.
 */
export async function createToken(options: CreateTokenOptions): Promise<void> {
  const context = await openProjectContext(options);
  const { found, session, environment } = context;
  const keys = await context.unlock();
  const label = environmentLabel(context.target, environment);
  const name = options.name ?? `${label} token`;
  const expiresAt = parseExpiry(options.expires);

  const tokenId = randomBytes(24).toString("hex");
  const tokenKeys = await generateUserKeys();
  const keyVersion = environment.currentKeyVersion;
  const projectId = found.link.projectId;
  const envKey = await fetchEnvKey({ session, keys, projectId, environment, keyVersion });
  const wrappedKey = await wrapEnvKeyFor(envKey, keys, tokenKeys.publicKey, {
    environmentId: environment.id,
    keyVersion,
  });
  await clearKey(envKey);
  // The server takes exactly the layers under the environment, whatever
  // .envy.json says about inheritRoot (ADR 0018).
  const layerWrappedKeys = [];
  for (const layer of layersUnder(environment, context.environments)) {
    const layerKey = await fetchEnvKey({
      session,
      keys,
      projectId,
      environment: layer,
      keyVersion: layer.currentKeyVersion,
    });
    layerWrappedKeys.push({
      environmentId: layer.id,
      wrappedKey: await wrapEnvKeyFor(layerKey, keys, tokenKeys.publicKey, {
        environmentId: layer.id,
        keyVersion: layer.currentKeyVersion,
      }),
    });
    await clearKey(layerKey);
  }

  const body = {
    environmentId: environment.id,
    name,
    tokenIdHash: createHash("sha256").update(tokenId).digest("hex"),
    publicKey: await toBase64Url(tokenKeys.publicKey),
    wrappedKey,
    layerWrappedKeys,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
  const created = await session.call((api) => api.v1.projects({ id: projectId }).tokens.post(body));
  // Made here, so this is the one time the key is known to be right.
  await pinConfirmedPublicKeys(projectId, [
    tokenKeyOwner({ id: created.id, name, publicKey: body.publicKey }),
  ]);
  const token = `envy_${tokenId}_${await toBase64Url(tokenKeys.privateKey)}`;
  await clearKey(tokenKeys.privateKey);

  output.info(`Store this as the ENVY_TOKEN secret in your CI. It is shown only once:`);
  output.result(token);
  const layers = layerWrappedKeys.length === 0 ? "" : " and the layers under it";
  output.success(`Created "${name}": it can read ${label}${layers}, and nothing else.`);
}

function parseExpiry(text: string | undefined): string | undefined {
  if (text === undefined) {
    return undefined;
  }
  const match = /^(\d+)d$/.exec(text);
  if (match?.[1] === undefined) {
    throw new CliError(`"${text}" is not a duration.`, {
      hint: "Use days, for example --expires 90d.",
    });
  }
  return new Date(Date.now() + Number(match[1]) * 24 * 60 * 60 * 1000).toISOString();
}

async function loadTokens() {
  const found = await requireProjectLink();
  const session = await openSession();
  const { items } = await session.call((api) =>
    api.v1.projects({ id: found.link.projectId }).tokens.get(),
  );
  return { session, items, projectId: found.link.projectId };
}

export async function listTokens(options: { json?: boolean }): Promise<void> {
  const { items, session, projectId } = await loadTokens();
  const appNames = new Map((await listApps(session, projectId)).map((app) => [app.id, app.name]));
  if (options.json === true) {
    output.result(JSON.stringify(items, null, 2));
    return;
  }
  if (items.length === 0) {
    output.success("This project has no service tokens.");
    return;
  }
  for (const token of items) {
    const state =
      token.revokedAt !== null
        ? "revoked"
        : token.lastUsedAt === null
          ? "never used"
          : `last used ${new Date(token.lastUsedAt).toISOString().slice(0, 10)}`;
    const app = token.environmentAppId === null ? undefined : appNames.get(token.environmentAppId);
    const environment =
      app === undefined ? token.environmentName : `${app}/${token.environmentName}`;
    output.result(`${token.name.padEnd(24)} ${environment.padEnd(20)} ${state}`);
  }
}

export async function revokeToken(name: string): Promise<void> {
  const { session, items } = await loadTokens();
  const matches = items.filter(
    (token) => token.revokedAt === null && (token.name === name || token.id === name),
  );
  const token = matches[0];
  if (token === undefined || matches.length > 1) {
    throw new CliError(
      matches.length > 1
        ? `More than one token is called "${name}".`
        : `There is no active token called "${name}".`,
      { hint: "Run envy token ls, and use the token id if names repeat." },
    );
  }
  await session.call((api) => api.v1.tokens({ id: token.id }).delete());
  output.success(`Revoked "${token.name}". It stops working at once.`);
}

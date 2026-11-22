import {
  clearKey,
  fromBase64Url,
  generateUserKeys,
  toBase64Url,
  unwrapEnvKey,
  wrapEnvKey,
} from "@envy/crypto";
import { createHash, randomBytes } from "node:crypto";
import { openProjectContext, type EnvironmentOptions } from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { requireProjectLink } from "../core/project-link.ts";
import { openSession } from "../core/session.ts";
import { checkPublicKeys } from "../core/trust.ts";
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
  const name = options.name ?? `${environment.name} token`;
  const expiresAt = parseExpiry(options.expires);

  const tokenId = randomBytes(24).toString("hex");
  const tokenKeys = await generateUserKeys();
  const ownKey = await session.call((api) =>
    api.v1
      .environments({ id: environment.id })
      .key.get({ query: { keyVersion: environment.currentKeyVersion } }),
  );
  const envKey = await unwrapEnvKey(await fromBase64Url(ownKey.wrappedKey), keys.privateKey);
  const wrappedKey = await toBase64Url(await wrapEnvKey(envKey, tokenKeys.publicKey));
  await clearKey(envKey);

  const body = {
    environmentId: environment.id,
    name,
    tokenIdHash: createHash("sha256").update(tokenId).digest("hex"),
    publicKey: await toBase64Url(tokenKeys.publicKey),
    wrappedKey,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
  const created = await session.call((api) =>
    api.v1.projects({ id: found.link.projectId }).tokens.post(body),
  );
  // Made here, so this is the one time the key is known to be right.
  await checkPublicKeys([
    {
      kind: "token",
      id: created.id,
      label: `the service token "${name}"`,
      publicKey: body.publicKey,
    },
  ]);
  const token = `envy_${tokenId}_${await toBase64Url(tokenKeys.privateKey)}`;
  await clearKey(tokenKeys.privateKey);

  output.info(`Store this as the ENVY_TOKEN secret in your CI. It is shown only once:`);
  output.result(token);
  output.success(`Created "${name}": it can read ${environment.name} and nothing else.`);
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
  return { session, items };
}

export async function listTokens(options: { json?: boolean }): Promise<void> {
  const { items } = await loadTokens();
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
    output.result(`${token.name.padEnd(24)} ${token.environmentName.padEnd(14)} ${state}`);
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

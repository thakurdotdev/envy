import { fromBase64Url, toBase64Url, wrapEnvKey } from "@envy/crypto";
import type { ApiCaller } from "./session.ts";
import { openTrustedEnvKey } from "./trust.ts";
import type { UnlockedKeys } from "./unlock.ts";

// Every environment key the CLI opens or wraps goes through here, so the
// check of who made a key (ADR 0016) cannot be skipped by one command.

/** Fetches this user's (or token's) copy of an environment key and opens it after the trust checks. */
export async function fetchEnvKey(input: {
  session: ApiCaller;
  keys: UnlockedKeys;
  projectId: string;
  environment: { id: string; name: string };
  keyVersion: number;
}): Promise<Uint8Array> {
  const { environment, keyVersion } = input;
  const key = await input.session.call((api) =>
    api.v1.environments({ id: environment.id }).key.get({ query: { keyVersion } }),
  );
  return openTrustedEnvKey({
    projectId: input.projectId,
    environment,
    key,
    keys: input.keys,
  });
}

/**
 * Wraps an environment key for one recipient, from this user. Check the
 * recipient's key with trustRecipients first.
 */
export async function wrapEnvKeyFor(
  envKey: Uint8Array,
  keys: UnlockedKeys,
  recipientPublicKey: string | Uint8Array,
  place: { environmentId: string; keyVersion: number },
): Promise<string> {
  const recipient =
    typeof recipientPublicKey === "string"
      ? await fromBase64Url(recipientPublicKey)
      : recipientPublicKey;
  return toBase64Url(
    await wrapEnvKey(envKey, {
      recipientPublicKey: recipient,
      senderPrivateKey: keys.privateKey,
      place,
    }),
  );
}

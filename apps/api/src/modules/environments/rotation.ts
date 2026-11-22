import type { EnvironmentRow } from "../../db/schema.ts";
import { assertBase64UrlBytes, base64UrlByteLength, BYTE_SIZES } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";

/**
 * Everything the client made for one environment's new key version: the new
 * key wrapped for each remaining member, and the latest secrets encrypted
 * again with it. The server cannot do any of this itself.
 */
export type EnvironmentRotation = {
  environmentId: string;
  newKeyVersion: number;
  wrappedKeys: Array<{ userId: string; wrappedKey: string }>;
  /** The new key wrapped for each active service token of this environment. */
  tokenWrappedKeys?: Array<{ tokenId: string; wrappedKey: string }> | undefined;
  /** The latest secret version the client re-encrypted (0 for an empty environment). */
  baseVersion: number;
  ciphertext?: string | undefined;
  nonce?: string | undefined;
};

function mismatch(message: string): AppError {
  return new AppError("ROTATION_MISMATCH", message, 409);
}

/**
 * Applies one rotation inside the caller's transaction. After it, the old
 * key version is no longer used for anything new, and the newest secret
 * version is readable only with the new key.
 */
export async function applyRotation(
  transaction: Repositories,
  context: RequestContext,
  environment: EnvironmentRow,
  rotation: EnvironmentRotation,
  recipientUserIds: Set<string>,
  now: Date,
  /** Tokens revoked in the same request: keys sent for them are dropped. */
  revokedTokenIds: ReadonlySet<string> = new Set(),
): Promise<void> {
  if (rotation.newKeyVersion !== environment.currentKeyVersion + 1) {
    throw mismatch(
      `${environment.name} is now on key version ${environment.currentKeyVersion}. Try again.`,
    );
  }
  const wrappedFor = new Set(rotation.wrappedKeys.map((recipient) => recipient.userId));
  const coversEveryRecipient =
    wrappedFor.size === rotation.wrappedKeys.length &&
    wrappedFor.size === recipientUserIds.size &&
    [...wrappedFor].every((userId) => recipientUserIds.has(userId));
  if (!coversEveryRecipient) {
    throw new AppError(
      "RECIPIENTS_MISMATCH",
      `Wrap the new ${environment.name} key exactly once for every remaining active member.`,
      400,
    );
  }
  // Service tokens keep working after a rotation only if they get the new key too.
  const activeTokenIds = new Set(
    (await transaction.tokens.listActiveForEnvironment(environment.id, now)).map(
      (token) => token.id,
    ),
  );
  const tokenKeys = (rotation.tokenWrappedKeys ?? []).filter(
    (key) => !revokedTokenIds.has(key.tokenId),
  );
  const wrappedForTokens = new Set(tokenKeys.map((key) => key.tokenId));
  const coversEveryToken =
    wrappedForTokens.size === tokenKeys.length &&
    wrappedForTokens.size === activeTokenIds.size &&
    [...wrappedForTokens].every((tokenId) => activeTokenIds.has(tokenId));
  if (!coversEveryToken) {
    throw new AppError(
      "RECIPIENTS_MISMATCH",
      `Wrap the new ${environment.name} key exactly once for every active service token.`,
      400,
    );
  }
  for (const recipient of [...rotation.wrappedKeys, ...tokenKeys]) {
    assertBase64UrlBytes(recipient.wrappedKey, BYTE_SIZES.wrappedEnvKey, "wrappedKey");
  }

  const latestVersion = await transaction.secrets.latestVersionNumber(environment.id);
  if (rotation.baseVersion !== latestVersion) {
    throw new AppError(
      "VERSION_CONFLICT",
      `Someone pushed to ${environment.name} meanwhile. Try again.`,
      409,
      { latestVersion },
    );
  }
  const hasSecrets = latestVersion > 0;
  if (hasSecrets !== (rotation.ciphertext !== undefined && rotation.nonce !== undefined)) {
    throw mismatch(
      hasSecrets
        ? `Re-encrypt the latest ${environment.name} secrets with the new key.`
        : `${environment.name} has no secrets, so send no ciphertext.`,
    );
  }

  const advanced = await transaction.environments.advanceKeyVersion(
    environment.id,
    environment.currentKeyVersion,
  );
  if (!advanced) {
    throw mismatch(`Someone rotated ${environment.name} at the same moment. Try again.`);
  }
  const createdBy = requireUser(context.actor).userId;
  await transaction.environments.addWrappedKeys([
    ...rotation.wrappedKeys.map((recipient) => ({
      environmentId: environment.id,
      keyVersion: rotation.newKeyVersion,
      recipientType: "user" as const,
      recipientId: recipient.userId,
      wrappedKey: recipient.wrappedKey,
      createdBy,
    })),
    ...tokenKeys.map((recipient) => ({
      environmentId: environment.id,
      keyVersion: rotation.newKeyVersion,
      recipientType: "token" as const,
      recipientId: recipient.tokenId,
      wrappedKey: recipient.wrappedKey,
      createdBy,
    })),
  ]);
  if (rotation.ciphertext !== undefined && rotation.nonce !== undefined) {
    assertBase64UrlBytes(rotation.nonce, BYTE_SIZES.nonce, "nonce");
    const ciphertextBytes = base64UrlByteLength(rotation.ciphertext) ?? 0;
    if (ciphertextBytes < BYTE_SIZES.minimumCiphertext) {
      throw new AppError("VALIDATION_FAILED", "The value of ciphertext is not valid.", 400);
    }
    await transaction.secrets.insert({
      environmentId: environment.id,
      version: latestVersion + 1,
      keyVersion: rotation.newKeyVersion,
      ciphertext: rotation.ciphertext,
      nonce: rotation.nonce,
      authorId: requireUser(context.actor).userId,
      message: "Key rotation",
    });
  }
  await recordAuditEvent(transaction.audit, context, {
    projectId: environment.projectId,
    action: "environment.rotated",
    targetType: "environment",
    targetId: environment.id,
    metadata: { keyVersion: rotation.newKeyVersion },
  });
}

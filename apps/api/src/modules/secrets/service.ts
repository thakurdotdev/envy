import { isUniqueViolation } from "../../db/executor.ts";
import type { SecretVersionRow } from "../../db/schema.ts";
import type { AccessChecker } from "../../lib/access.ts";
import { assertBase64UrlBytes, base64UrlByteLength, BYTE_SIZES } from "../../lib/base64url.ts";
import { AppError } from "../../lib/errors.ts";
import { DEFAULT_PAGE_SIZE, toPage } from "../../lib/pagination.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";

/** The largest encrypted environment the API stores (128 KiB). */
export const MAX_CIPHERTEXT_BYTES = 128 * 1024;

export type PushSecretsInput = {
  baseVersion: number;
  keyVersion: number;
  ciphertext: string;
  nonce: string;
  message?: string | undefined;
};

function versionConflict(latestVersion: number): AppError {
  return new AppError(
    "VERSION_CONFLICT",
    `Someone pushed version ${latestVersion} since you last pulled. Pull, check the changes and push again.`,
    409,
    { latestVersion },
  );
}

export function createSecretService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
}) {
  const { repositories, runInTransaction, access } = dependencies;

  return {
    /** The latest encrypted blob (or one version). `current` is null for an empty environment. */
    async getSecrets(context: RequestContext, environmentId: string, version: number | undefined) {
      const environment = await access.assertEnvironmentRole(context, environmentId, "viewer");
      const row = await repositories.secrets.findVersion(environmentId, version);
      if (row === undefined && version !== undefined) {
        throw new AppError("VERSION_NOT_FOUND", `This environment has no version ${version}.`, 404);
      }
      await recordAuditEvent(repositories.audit, context, {
        projectId: environment.projectId,
        action: "secrets.read",
        targetType: "environment",
        targetId: environmentId,
        metadata: { version: row?.version ?? 0 },
      });
      return { current: row === undefined ? null : toSecretVersionDto(row) };
    },

    async pushSecrets(context: RequestContext, environmentId: string, input: PushSecretsInput) {
      const environment = await access.assertEnvironmentRole(context, environmentId, "member");
      assertBase64UrlBytes(input.nonce, BYTE_SIZES.nonce, "nonce");
      const ciphertextBytes = base64UrlByteLength(input.ciphertext);
      if (ciphertextBytes === undefined || ciphertextBytes < BYTE_SIZES.minimumCiphertext) {
        throw new AppError("VALIDATION_FAILED", "The value of ciphertext is not valid.", 400);
      }
      if (ciphertextBytes > MAX_CIPHERTEXT_BYTES) {
        throw new AppError(
          "SECRETS_TOO_LARGE",
          "This environment is too large to store (the limit is 128 KiB encrypted).",
          413,
        );
      }
      if (input.keyVersion !== environment.currentKeyVersion) {
        throw new AppError(
          "KEY_VERSION_OUTDATED",
          "The environment key changed since you last pulled. Pull again, then push.",
          409,
          { currentKeyVersion: environment.currentKeyVersion },
        );
      }
      const latestVersion = await repositories.secrets.latestVersionNumber(environmentId);
      if (input.baseVersion !== latestVersion) {
        throw versionConflict(latestVersion);
      }

      try {
        const created = await runInTransaction(async (transaction) => {
          // The client encrypted for exactly this version number (it is in
          // the AAD), so the server must not pick a different one.
          const row = await transaction.secrets.insert({
            environmentId,
            version: input.baseVersion + 1,
            keyVersion: input.keyVersion,
            ciphertext: input.ciphertext,
            nonce: input.nonce,
            authorId: requireUser(context.actor).userId,
            message: input.message ?? null,
          });
          await recordAuditEvent(transaction.audit, context, {
            projectId: environment.projectId,
            action: "secrets.pushed",
            targetType: "environment",
            targetId: environmentId,
            metadata: { version: row.version, keyVersion: row.keyVersion },
          });
          return row;
        });
        return toSecretVersionDto(created);
      } catch (error) {
        if (isUniqueViolation(error)) {
          // Another push for the same version won the race.
          throw versionConflict(await repositories.secrets.latestVersionNumber(environmentId));
        }
        throw error;
      }
    },

    /** Version history, newest first. Metadata only, never ciphertext. */
    async listVersions(
      context: RequestContext,
      environmentId: string,
      page: { cursor?: number | undefined; limit?: number | undefined },
    ) {
      await access.assertEnvironmentRole(context, environmentId, "viewer");
      const limit = page.limit ?? DEFAULT_PAGE_SIZE;
      const rows = await repositories.secrets.listVersions({
        environmentId,
        beforeVersion: page.cursor,
        limit: limit + 1,
      });
      return toPage(
        rows,
        limit,
        (row) => ({
          version: row.version,
          keyVersion: row.keyVersion,
          message: row.message,
          author: { id: row.authorId, githubLogin: row.authorLogin },
          createdAt: row.createdAt.toISOString(),
        }),
        (row) => String(row.version),
      );
    },
  };
}

function toSecretVersionDto(row: SecretVersionRow) {
  return {
    environmentId: row.environmentId,
    version: row.version,
    keyVersion: row.keyVersion,
    ciphertext: row.ciphertext,
    nonce: row.nonce,
    authorId: row.authorId,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

export type SecretService = ReturnType<typeof createSecretService>;

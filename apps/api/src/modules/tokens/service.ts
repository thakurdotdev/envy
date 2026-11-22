import { createHash } from "node:crypto";
import { environmentNotFound, type AccessChecker } from "../../lib/access.ts";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";
import type { TokenActor } from "../auth/service.ts";

// A service token is `envy_<tokenId>_<privateKey>`, made on the client. Only
// `envy_<tokenId>` is ever sent, as the bearer token. The server stores the
// SHA-256 of the token id and the environment key wrapped for the token's
// public key, so it still never sees anything that can decrypt.

const BEARER_PATTERN = /^Bearer envy_([0-9a-f]{48})$/;
const TOKEN_ID_HASH_PATTERN = /^[0-9a-f]{64}$/;

export function hashTokenId(tokenId: string): string {
  return createHash("sha256").update(tokenId).digest("hex");
}

function noSuchToken(): AppError {
  return new AppError("TOKEN_NOT_FOUND", "There is no such service token.", 404);
}

function tokenNotFound(): AppError {
  return new AppError(
    "TOKEN_NOT_FOUND",
    "This service token does not exist, was revoked or has expired.",
    401,
  );
}

export type CreateTokenInput = {
  environmentId: string;
  name: string;
  tokenIdHash: string;
  publicKey: string;
  wrappedKey: string;
  expiresAt?: string | undefined;
};

export function createTokenService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
}) {
  const { repositories, runInTransaction, access, clock } = dependencies;

  return {
    /** Checks an `Authorization: Bearer envy_<tokenId>` header. */
    async authenticate(authorizationHeader: string | undefined): Promise<TokenActor> {
      const tokenId = authorizationHeader?.match(BEARER_PATTERN)?.[1];
      if (tokenId === undefined) {
        throw tokenNotFound();
      }
      const now = clock.now();
      const token = await repositories.tokens.findActiveByIdHash(hashTokenId(tokenId), now);
      const project =
        token === undefined ? undefined : await repositories.projects.findById(token.projectId);
      if (token === undefined || project === undefined) {
        throw tokenNotFound();
      }
      await repositories.tokens.markUsed(token.id, now);
      return {
        type: "token",
        tokenId: token.id,
        projectId: token.projectId,
        environmentId: token.environmentId,
      };
    },

    async create(context: RequestContext, projectId: string, input: CreateTokenInput) {
      const user = requireUser(context.actor);
      await access.assertRole(context, projectId, "admin");
      const environment = await repositories.environments.findById(input.environmentId);
      if (environment === undefined || environment.projectId !== projectId) {
        throw environmentNotFound();
      }
      if (!TOKEN_ID_HASH_PATTERN.test(input.tokenIdHash)) {
        throw new AppError(
          "VALIDATION_FAILED",
          "The value of tokenIdHash must be a SHA-256 in hex.",
          400,
        );
      }
      assertBase64UrlBytes(input.publicKey, BYTE_SIZES.publicKey, "publicKey");
      assertBase64UrlBytes(input.wrappedKey, BYTE_SIZES.wrappedEnvKey, "wrappedKey");
      const expiresAt = input.expiresAt === undefined ? null : new Date(input.expiresAt);
      if (expiresAt !== null && (Number.isNaN(expiresAt.getTime()) || expiresAt <= clock.now())) {
        throw new AppError(
          "VALIDATION_FAILED",
          "The value of expiresAt must be a date in the future.",
          400,
        );
      }

      const token = await runInTransaction(async (transaction) => {
        const created = await transaction.tokens.create({
          projectId,
          environmentId: environment.id,
          name: input.name,
          tokenIdHash: input.tokenIdHash,
          publicKey: input.publicKey,
          createdBy: user.userId,
          expiresAt,
        });
        await transaction.environments.addWrappedKeys([
          {
            environmentId: environment.id,
            keyVersion: environment.currentKeyVersion,
            recipientType: "token",
            recipientId: created.id,
            wrappedKey: input.wrappedKey,
            createdBy: user.userId,
          },
        ]);
        await recordAuditEvent(transaction.audit, context, {
          projectId,
          action: "token.created",
          targetType: "token",
          targetId: created.id,
          metadata: { name: created.name, environment: environment.name },
        });
        return created;
      });
      return { ...toTokenDto(token), environmentName: environment.name };
    },

    async list(context: RequestContext, projectId: string) {
      await access.assertRole(context, projectId, "admin");
      const rows = await repositories.tokens.listForProject(projectId);
      return {
        items: rows.map((row) => ({
          ...toTokenDto(row.token),
          environmentName: row.environmentName,
        })),
      };
    },

    async revoke(context: RequestContext, tokenId: string): Promise<void> {
      const token = await repositories.tokens.findById(tokenId);
      if (token === undefined) {
        throw noSuchToken();
      }
      await access.assertRole(context, token.projectId, "admin", noSuchToken);
      await runInTransaction(async (transaction) => {
        await transaction.tokens.revoke(token.id, clock.now());
        await recordAuditEvent(transaction.audit, context, {
          projectId: token.projectId,
          action: "token.revoked",
          targetType: "token",
          targetId: token.id,
          metadata: { name: token.name },
        });
      });
    },

    /** For a token: which project and environment it belongs to. */
    async describeCurrent(context: RequestContext) {
      const actor = context.actor;
      if (actor.type !== "token") {
        throw new AppError("TOKEN_NOT_FOUND", "This route is for service tokens.", 400);
      }
      const environments = await repositories.environments.listForProject(actor.projectId);
      const environment = environments.find((candidate) => candidate.id === actor.environmentId);
      if (environment === undefined) {
        throw tokenNotFound();
      }
      return {
        projectId: actor.projectId,
        environment: {
          id: environment.id,
          name: environment.name,
          isShared: environment.isShared,
          isProtected: environment.isProtected,
          currentKeyVersion: environment.currentKeyVersion,
          latestVersion: environment.latestVersion,
        },
      };
    },
  };
}

function toTokenDto(token: {
  id: string;
  name: string;
  environmentId: string;
  publicKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: token.id,
    name: token.name,
    environmentId: token.environmentId,
    publicKey: token.publicKey,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

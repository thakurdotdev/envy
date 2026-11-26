import { isUniqueViolation } from "../../db/executor.ts";
import type { ProjectRow } from "../../db/schema.ts";
import { projectNotFound, type AccessChecker } from "../../lib/access.ts";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { DEFAULT_PAGE_SIZE, toPage } from "../../lib/pagination.ts";
import { requireUser, type RequestContext } from "../../lib/request-context.ts";
import type { Repositories, RunInTransaction } from "../../repositories.ts";
import { recordAuditEvent } from "../audit/service.ts";

/** Every new project starts with these environments, in this order. */
export const STARTER_ENVIRONMENTS = [
  { name: "shared", isShared: true, isProtected: false },
  { name: "development", isShared: false, isProtected: false },
  { name: "staging", isShared: false, isProtected: false },
  { name: "production", isShared: false, isProtected: true },
] as const;

type StarterEnvironmentName = (typeof STARTER_ENVIRONMENTS)[number]["name"];

export type CreateProjectInput = {
  name: string;
  slug?: string | undefined;
  environmentKeys: Record<StarterEnvironmentName, string>;
  environmentIds: Record<StarterEnvironmentName, string>;
};

export function createProjectService(dependencies: {
  repositories: Repositories;
  runInTransaction: RunInTransaction;
  access: AccessChecker;
  clock: Clock;
}) {
  const { repositories, runInTransaction, access, clock } = dependencies;

  return {
    async createProject(context: RequestContext, input: CreateProjectInput) {
      for (const environment of STARTER_ENVIRONMENTS) {
        assertBase64UrlBytes(
          input.environmentKeys[environment.name],
          BYTE_SIZES.wrappedEnvKey,
          `environmentKeys.${environment.name}`,
        );
      }
      const ids = new Set(Object.values(input.environmentIds));
      if (ids.size !== STARTER_ENVIRONMENTS.length) {
        throw new AppError("VALIDATION_FAILED", "Each environment needs its own id.", 400);
      }
      const ownerId = requireUser(context.actor).userId;
      const slug = input.slug ?? makeSlug(input.name);
      try {
        const project = await runInTransaction(async (transaction) => {
          const created = await transaction.projects.create({ name: input.name, slug, ownerId });
          await transaction.members.add({
            projectId: created.id,
            userId: ownerId,
            role: "owner",
            status: "active",
          });
          for (const starter of STARTER_ENVIRONMENTS) {
            const environment = await transaction.environments.create({
              id: input.environmentIds[starter.name],
              projectId: created.id,
              appId: null,
              ...starter,
            });
            await transaction.environments.addWrappedKeys([
              {
                environmentId: environment.id,
                keyVersion: environment.currentKeyVersion,
                recipientType: "user",
                recipientId: ownerId,
                wrappedKey: input.environmentKeys[starter.name],
                createdBy: ownerId,
              },
            ]);
          }
          await recordAuditEvent(transaction.audit, context, {
            projectId: created.id,
            action: "project.created",
            targetType: "project",
            targetId: created.id,
            metadata: { name: created.name },
          });
          return created;
        });
        return toProjectDto(project, "owner");
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            "PROJECT_SLUG_TAKEN",
            `You already have a project called "${slug}". Pick another name or slug.`,
            409,
          );
        }
        throw error;
      }
    },

    async listProjects(
      context: RequestContext,
      page: { cursor?: string | undefined; limit?: number | undefined },
    ) {
      const limit = page.limit ?? DEFAULT_PAGE_SIZE;
      const rows = await repositories.projects.listForUser({
        userId: requireUser(context.actor).userId,
        beforeId: page.cursor,
        limit: limit + 1,
      });
      // Admins see how many people wait for keys, so the CLI can offer to grant them.
      const adminProjectIds = rows
        .filter((row) => row.role === "owner" || row.role === "admin")
        .map((row) => row.id);
      const pending = await repositories.members.countPending(adminProjectIds);
      return toPage(
        rows,
        limit,
        (row) => ({
          ...toProjectDto(row, row.role),
          pendingMembers: adminProjectIds.includes(row.id) ? (pending.get(row.id) ?? 0) : null,
        }),
        (row) => row.id,
      );
    },

    async getProject(context: RequestContext, projectId: string) {
      const role = await access.assertRole(context, projectId, "viewer");
      return toProjectDto(await findProject(repositories, projectId), role);
    },

    async renameProject(context: RequestContext, projectId: string, name: string) {
      const role = await access.assertRole(context, projectId, "admin");
      await runInTransaction(async (transaction) => {
        await transaction.projects.rename(projectId, name);
        await recordAuditEvent(transaction.audit, context, {
          projectId,
          action: "project.renamed",
          targetType: "project",
          targetId: projectId,
          metadata: { name },
        });
      });
      return toProjectDto(await findProject(repositories, projectId), role);
    },

    /**
     * Hides the project at once: nobody can read it, and its service tokens
     * stop working. The owner can restore it for 30 days; then it is removed
     * for good.
     */
    async deleteProject(context: RequestContext, projectId: string) {
      await access.assertRole(context, projectId, "owner");
      const deletedAt = clock.now();
      await runInTransaction(async (transaction) => {
        await transaction.projects.softDelete(projectId, deletedAt);
        await recordAuditEvent(transaction.audit, context, {
          projectId,
          action: "project.deleted",
          targetType: "project",
          targetId: projectId,
        });
      });
      return { purgeAfter: purgeDate(deletedAt).toISOString() };
    },

    /** The caller's own deleted projects that can still be restored. */
    async listDeletedProjects(context: RequestContext) {
      const ownerId = requireUser(context.actor).userId;
      const since = new Date(clock.now().getTime() - RESTORE_DAYS * DAY_MS);
      const rows = await repositories.projects.listDeletedOwnedBy(ownerId, since);
      return {
        items: rows.map((row) => ({
          ...toProjectDto(row, "owner"),
          deletedAt: row.deletedAt?.toISOString() ?? null,
          purgeAfter: row.deletedAt === null ? null : purgeDate(row.deletedAt).toISOString(),
        })),
      };
    },

    /** Brings back a project its owner deleted less than 30 days ago. */
    async restoreProject(context: RequestContext, projectId: string) {
      const ownerId = requireUser(context.actor).userId;
      const project = await repositories.projects.findDeletedById(projectId);
      const restorable =
        project !== undefined &&
        project.ownerId === ownerId &&
        project.deletedAt !== null &&
        purgeDate(project.deletedAt) > clock.now();
      if (!restorable) {
        throw projectNotFound();
      }
      try {
        await runInTransaction(async (transaction) => {
          if (!(await transaction.projects.restore(projectId))) {
            throw projectNotFound();
          }
          await recordAuditEvent(transaction.audit, context, {
            projectId,
            action: "project.restored",
            targetType: "project",
            targetId: projectId,
          });
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            "PROJECT_SLUG_TAKEN",
            `You made another project called "${project.slug}" since. Rename that one first.`,
            409,
          );
        }
        throw error;
      }
      return toProjectDto({ ...project, deletedAt: null }, "owner");
    },
  };
}

/** How long a deleted project can be restored before it is removed for good. */
export const RESTORE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function purgeDate(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + RESTORE_DAYS * DAY_MS);
}

async function findProject(repositories: Repositories, projectId: string): Promise<ProjectRow> {
  const project = await repositories.projects.findById(projectId);
  if (project === undefined) {
    throw projectNotFound();
  }
  return project;
}

function toProjectDto(project: ProjectRow, role: string) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    ownerId: project.ownerId,
    role,
    createdAt: project.createdAt.toISOString(),
  };
}

/** "My App 2" becomes "my-app-2". */
export function makeSlug(name: string): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug === "" ? "project" : slug;
}

export type ProjectService = ReturnType<typeof createProjectService>;

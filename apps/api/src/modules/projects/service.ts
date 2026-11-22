import { isUniqueViolation } from "../../db/executor.ts";
import type { ProjectRow } from "../../db/schema.ts";
import { projectNotFound, type AccessChecker } from "../../lib/access.ts";
import { assertBase64UrlBytes, BYTE_SIZES } from "../../lib/base64url.ts";
import type { Clock } from "../../lib/clock.ts";
import { AppError } from "../../lib/errors.ts";
import { DEFAULT_PAGE_SIZE, toPage } from "../../lib/pagination.ts";
import type { RequestContext } from "../../lib/request-context.ts";
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
      const ownerId = context.actor.userId;
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
              projectId: created.id,
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
        userId: context.actor.userId,
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

    async deleteProject(context: RequestContext, projectId: string): Promise<void> {
      await access.assertRole(context, projectId, "owner");
      await runInTransaction(async (transaction) => {
        await transaction.projects.softDelete(projectId, clock.now());
        await recordAuditEvent(transaction.audit, context, {
          projectId,
          action: "project.deleted",
          targetType: "project",
          targetId: projectId,
        });
      });
    },
  };
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

import type { EnvironmentRow, MemberRole } from "../db/schema.ts";
import type { EnvironmentRepository } from "../modules/environments/repository.ts";
import type { MemberRepository } from "../modules/members/repository.ts";
import { AppError } from "./errors.ts";
import { requireUser, type RequestContext } from "./request-context.ts";

// Each role can do everything the roles below it can.
const ROLE_RANK: Record<MemberRole, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export function projectNotFound(): AppError {
  return new AppError(
    "PROJECT_NOT_FOUND",
    "There is no such project, or you are not a member.",
    404,
  );
}

export function environmentNotFound(): AppError {
  return new AppError(
    "ENVIRONMENT_NOT_FOUND",
    "There is no such environment, or you are not a member of its project.",
    404,
  );
}

function forbidden(minimumRole: MemberRole): AppError {
  return new AppError(
    "FORBIDDEN",
    `This needs the ${minimumRole} role or higher in the project.`,
    403,
  );
}

/**
 * The one place that decides who may do what. Someone who is not a member
 * gets "not found" rather than "forbidden", so they cannot even tell whether
 * a project exists. A member whose role is too low gets "forbidden".
 */
export function createAccessChecker(repositories: {
  members: MemberRepository;
  environments: EnvironmentRepository;
}) {
  async function assertRole(
    context: RequestContext,
    projectId: string,
    minimumRole: MemberRole,
    notFound: () => AppError = projectNotFound,
  ): Promise<MemberRole> {
    // Service tokens never act at project level; they only read their environment.
    const user = requireUser(context.actor);
    const role = await repositories.members.findActiveRole(projectId, user.userId);
    if (role === undefined) {
      throw notFound();
    }
    if (ROLE_RANK[role] < ROLE_RANK[minimumRole]) {
      throw forbidden(minimumRole);
    }
    return role;
  }

  return {
    assertRole,

    /** Finds the environment and checks the caller's role in its project. */
    async assertEnvironmentRole(
      context: RequestContext,
      environmentId: string,
      minimumRole: MemberRole,
    ): Promise<EnvironmentRow> {
      const environment = await repositories.environments.findById(environmentId);
      if (environment === undefined) {
        throw environmentNotFound();
      }
      const actor = context.actor;
      if (actor.type === "token") {
        // A token sees exactly one environment, and only to read it.
        if (actor.environmentId !== environment.id) {
          throw environmentNotFound();
        }
        if (minimumRole !== "viewer") {
          requireUser(actor);
        }
        return environment;
      }
      await assertRole(context, environment.projectId, minimumRole, environmentNotFound);
      return environment;
    },
  };
}

export type AccessChecker = ReturnType<typeof createAccessChecker>;

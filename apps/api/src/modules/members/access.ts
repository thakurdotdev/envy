import { memberCanRead } from "@envy/shared";
import type { EnvironmentRow, MemberRole } from "../../db/schema.ts";
import { AppError } from "../../lib/errors.ts";
import type { Repositories } from "../../repositories.ts";

// Access per environment (ADR 0019): which environments a member can read,
// and checks that the keys a client sends match it exactly.

type Environment = EnvironmentRow & { latestVersion: number };

/**
 * Checks an access list before it is saved: null (every environment) is
 * always fine; a list needs a member or viewer role and real stage names.
 * Returns it without repeats.
 */
export async function checkAccessList(
  repositories: Repositories,
  projectId: string,
  role: MemberRole,
  access: string[] | null,
): Promise<string[] | null> {
  if (access === null) {
    return null;
  }
  if (role === "owner" || role === "admin") {
    throw new AppError(
      "VALIDATION_FAILED",
      "Admins and owners always have every environment: they manage the keys.",
      400,
    );
  }
  const stages = new Set(
    (await repositories.environments.listForProject(projectId))
      .filter((environment) => environment.appId === null && !environment.isShared)
      .map((environment) => environment.name),
  );
  const unknown = access.filter((name) => !stages.has(name));
  if (unknown.length > 0) {
    throw new AppError(
      "VALIDATION_FAILED",
      `This project has no stage called ${unknown.join(", ")}. Pick from: ${[...stages].join(", ")}.`,
      400,
    );
  }
  return [...new Set(access)].toSorted();
}

/** The environments (root and app ones) a member with this access can read. */
export function readableEnvironments(
  environments: Environment[],
  access: string[] | null,
): Environment[] {
  return environments.filter((environment) => memberCanRead({ access }, environment));
}

/**
 * The member needs a key for each of these environments, each at its
 * current key version: no more (that would leak access), no fewer.
 */
export function assertKeysForEnvironments(
  wrappedKeys: Array<{ environmentId: string; keyVersion: number }>,
  environments: Environment[],
): void {
  const expected = new Map(
    environments.map((environment) => [environment.id, environment.currentKeyVersion]),
  );
  const matches =
    wrappedKeys.length === expected.size &&
    new Set(wrappedKeys.map((key) => key.environmentId)).size === expected.size &&
    wrappedKeys.every((key) => expected.get(key.environmentId) === key.keyVersion);
  if (!matches) {
    throw new AppError(
      "RECIPIENTS_MISMATCH",
      "Send one wrapped key for every environment this member can read, at its current key version.",
      400,
    );
  }
}

/** Rotations must cover exactly these environments. */
export function assertRotationsFor(
  rotations: Array<{ environmentId: string }>,
  environments: Environment[],
): void {
  const given = new Set(rotations.map((rotation) => rotation.environmentId));
  const matches =
    given.size === rotations.length &&
    given.size === environments.length &&
    environments.every((environment) => given.has(environment.id));
  if (!matches) {
    throw new AppError(
      "ROTATION_MISMATCH",
      "Send a key rotation for exactly the environments this member loses.",
      400,
    );
  }
}

export function describeAccess(access: string[] | null): string {
  return access === null ? "all" : access.join(", ");
}

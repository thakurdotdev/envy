import type { Database } from "./db/client.ts";
import type { Executor } from "./db/executor.ts";
import { createAuditRepository } from "./modules/audit/repository.ts";
import { createEnvironmentRepository } from "./modules/environments/repository.ts";
import { createMemberRepository } from "./modules/members/repository.ts";
import { createProjectRepository } from "./modules/projects/repository.ts";
import { createSecretRepository } from "./modules/secrets/repository.ts";
import { createUserRepository } from "./modules/users/repository.ts";

/** The repositories that services share, all running on the same executor. */
export function createRepositories(executor: Executor) {
  return {
    audit: createAuditRepository(executor),
    environments: createEnvironmentRepository(executor),
    members: createMemberRepository(executor),
    projects: createProjectRepository(executor),
    secrets: createSecretRepository(executor),
    users: createUserRepository(executor),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

/** Runs work in one transaction: every write inside it is saved, or none is. */
export type RunInTransaction = <Result>(
  work: (repositories: Repositories) => Promise<Result>,
) => Promise<Result>;

export function createRunInTransaction(database: Database): RunInTransaction {
  return (work) => database.transaction((transaction) => work(createRepositories(transaction)));
}

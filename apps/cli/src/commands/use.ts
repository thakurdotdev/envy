import { CliError } from "../core/errors.ts";
import { requireProjectLink, writeProjectLink } from "../core/project-link.ts";
import { listEnvironments } from "../core/secrets.ts";
import { openSession } from "../core/session.ts";
import { output } from "../ui/output.ts";

/** Sets the environment this folder uses when no --env is given. */
export async function useEnvironment(name: string): Promise<void> {
  const found = await requireProjectLink();
  const session = await openSession();
  // Stages are root environments; every app has the same ones.
  const environments = (await listEnvironments(session, found.link.projectId)).filter(
    (environment) => environment.appId === null,
  );
  const environment = environments.find((candidate) => candidate.name === name);
  if (environment === undefined) {
    throw new CliError(`This project has no environment called "${name}".`, {
      hint: `Pick one of: ${environments.map((candidate) => candidate.name).join(", ")}.`,
    });
  }
  if (environment.isProtected) {
    throw new CliError(`"${name}" is protected, so it cannot be the default.`, {
      hint: `Pass --env ${name} each time you mean it.`,
    });
  }
  await writeProjectLink(found.folder, { ...found.link, defaultEnvironment: name });
  output.success(`This folder now uses ${name} by default. Commit .envy.json to share it.`);
}

import { CliError } from "../core/errors.ts";
import { findProjectLink } from "../core/project-link.ts";
import { openSession, type Session } from "../core/session.ts";
import { output } from "../ui/output.ts";
import { askText, isInteractive } from "../ui/prompts.ts";

// envy projects: list, delete and restore projects. A deleted project can
// be restored by its owner for 30 days, then it is removed for good.

type ProjectItem = { id: string; name: string; slug: string; role: string };

export async function listProjects(options: { json?: boolean; deleted?: boolean }) {
  const session = await openSession();
  if (options.deleted === true) {
    const { items } = await session.call((api) => api.v1.projects.deleted.get());
    if (options.json === true) {
      output.result(JSON.stringify(items, null, 2));
      return;
    }
    if (items.length === 0) {
      output.success("You have no deleted projects to restore.");
      return;
    }
    for (const project of items) {
      const until =
        project.purgeAfter === null ? "" : `restorable until ${day(project.purgeAfter)}`;
      output.result(`${project.name.padEnd(24)} ${project.slug.padEnd(24)} ${until}`);
    }
    return;
  }
  const items = await listOwnProjects(session);
  if (options.json === true) {
    output.result(JSON.stringify(items, null, 2));
    return;
  }
  if (items.length === 0) {
    output.success("You have no projects yet. Run envy init in a project folder.");
    return;
  }
  for (const project of items) {
    output.result(`${project.name.padEnd(24)} ${project.slug.padEnd(24)} ${project.role}`);
  }
}

/** Deletes a project (owner only). It can be restored for 30 days. */
export async function deleteProject(who: string, options: { yes?: boolean }): Promise<void> {
  const session = await openSession();
  const project = findProject(await listOwnProjects(session), who);
  if (project.role !== "owner") {
    throw new CliError(`Only the owner can delete ${project.name}.`, {
      hint: "Ask the project owner, or leave it with envy members rm yourself.",
    });
  }
  if (options.yes !== true) {
    if (!isInteractive()) {
      throw new CliError(`Deleting ${project.name} needs a confirmation.`, {
        hint: `Add --yes to delete ${project.name}.`,
      });
    }
    output.warn(
      `Deleting ${project.name} stops everyone, and every service token, from reading its secrets.`,
    );
    const typed = await askText(`Type ${project.slug} to delete it`, "Add --yes to delete it.");
    if (typed.trim() !== project.slug) {
      throw new CliError("The name did not match. Nothing was deleted.");
    }
  }
  const deleted = await session.call((api) => api.v1.projects({ id: project.id }).delete());
  output.success(
    `Deleted ${project.name}. You can restore it until ${day(deleted.purgeAfter)} with envy projects restore ${project.slug}.`,
  );
  const linked = await findProjectLink().catch(() => undefined);
  if (linked?.link.projectId === project.id) {
    output.info(
      "This folder is still linked to it. Run envy init --force to link another project.",
    );
  }
}

export async function restoreProject(who: string): Promise<void> {
  const session = await openSession();
  const { items } = await session.call((api) => api.v1.projects.deleted.get());
  const project = findProject(
    items.map((item) => ({ ...item, role: "owner" })),
    who,
    "Run envy projects ls --deleted to see what you can restore.",
  );
  await session.call((api) => api.v1.projects({ id: project.id }).restore.post());
  output.success(`Restored ${project.name}. Everyone who had access has it again.`);
}

async function listOwnProjects(session: Session): Promise<ProjectItem[]> {
  const { items } = await session.call((api) => api.v1.projects.get({ query: { limit: 100 } }));
  return items;
}

/** By name, slug or id. */
function findProject(
  projects: ProjectItem[],
  who: string,
  hint = "Run envy projects ls to see your projects.",
): ProjectItem {
  const needle = who.toLowerCase();
  const project = projects.find(
    (candidate) =>
      candidate.id === who || candidate.slug === needle || candidate.name.toLowerCase() === needle,
  );
  if (project === undefined) {
    throw new CliError(`You have no project called "${who}".`, { hint });
  }
  return project;
}

// Eden turns ISO date strings into Date objects at runtime, so accept both.
function day(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

/** Every section of the docs page, in order, grouped as the sidebar shows them. */
export const DOC_GROUPS = [
  {
    title: "Get started",
    sections: [
      { id: "quick-start", title: "Quick start" },
      { id: "install", title: "Install" },
      { id: "sign-in", title: "Sign in" },
      { id: "project", title: "Link a project" },
      { id: "run", title: "Run your app" },
    ],
  },
  {
    title: "Every day",
    sections: [
      { id: "values", title: "Change values" },
      { id: "environments", title: "Environments" },
      { id: "history", title: "History and rollback" },
      { id: "monorepo", title: "Monorepos" },
    ],
  },
  {
    title: "Team",
    sections: [
      { id: "team", title: "Add a teammate" },
      { id: "access", title: "Limit access" },
      { id: "remove", title: "Remove someone" },
    ],
  },
  {
    title: "CI and scripts",
    sections: [
      { id: "ci", title: "Use it in CI" },
      { id: "scripts", title: "Settings for scripts" },
    ],
  },
  {
    title: "Reference",
    sections: [
      { id: "how-it-works", title: "How it works" },
      { id: "commands", title: "All commands" },
      { id: "help", title: "If something breaks" },
    ],
  },
] as const;

export type DocSectionId = (typeof DOC_GROUPS)[number]["sections"][number]["id"];

/** Every section in page order, without the groups. */
export const ALL_DOC_SECTIONS: readonly { id: DocSectionId; title: string }[] = DOC_GROUPS.flatMap<{
  id: DocSectionId;
  title: string;
}>((group) => group.sections);

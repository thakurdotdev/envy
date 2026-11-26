import { CopyCommand } from "@/components/site/copy-command";
import { GITHUB_URL } from "@/components/site/links";
import { A, Code, Commands, DocSection, GroupTitle } from "./blocks";

const COMMAND_GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Account",
    rows: [
      ["envy login [--api-url <url>]", "sign in with GitHub; unlock your keys on this device"],
      ["envy logout", "sign out here and remove this device's keys"],
      ["envy password", "change your master password"],
      ["envy recover", "set a new master password with your recovery key"],
    ],
  },
  {
    title: "Project",
    rows: [
      ["envy init", "link this folder to a project and import .env files"],
      ["envy projects ls", "your projects and your role in each"],
      ["envy projects rm <project>", "delete a project (owner; restorable for 30 days)"],
      ["envy projects restore <project>", "bring back a deleted project"],
      ["envy apps ls | add | rm", "the apps of a monorepo"],
      ["envy env ls | add", "list or add environments"],
      ["envy use <environment>", "set this folder's default environment"],
    ],
  },
  {
    title: "Values",
    rows: [
      ["envy run -- <command>", "run a command with the variables set"],
      ["envy pull", "write the variables to .env"],
      ["envy push [-m <note>]", "save your .env as a new version"],
      ["envy set KEY[=value]", "set values"],
      ["envy unset KEY", "remove values"],
      ["envy get KEY", "print one value"],
      ["envy history", "list versions"],
      ["envy rollback <version>", "save an old version again"],
    ],
  },
  {
    title: "Team and CI",
    rows: [
      ["envy members ls", "members, roles, access and fingerprints"],
      ["envy members invite <email>", "make an invite link"],
      ["envy accept <link>", "join a project"],
      ["envy members grant [member]", "give a new member their keys"],
      ["envy members access <member> <stages>", "choose which environments they read"],
      ["envy members role <member> <role>", "change a role"],
      ["envy members rm <member>", "remove someone and change the keys"],
      ["envy token create | ls | revoke", "read-only tokens for CI"],
    ],
  },
  {
    title: "Tools",
    rows: [
      ["envy doctor", "check that everything is set up"],
      ["envy upgrade [--check]", "update envy itself"],
      ["envy completion bash|zsh|fish", "print a shell completion script"],
      ["envy", "a menu of common actions"],
    ],
  },
];

/** The Reference group of the docs page. */
export function ReferenceDocs() {
  return (
    <>
      <GroupTitle>Reference</GroupTitle>

      <DocSection
        id="how-it-works"
        title="How it works"
        lead="Four ideas explain everything Envy does."
      >
        <dl className="space-y-5">
          <Idea term="Project">
            One repo, linked by <Code>.envy.json</Code>. It has members, environments and, in a
            monorepo, apps.
          </Idea>
          <Idea term="Environment">
            A set of variables such as development or production. Each one has its own random key,
            and every member gets a copy of that key locked for them alone.
          </Idea>
          <Idea term="Layer">
            Environments stack. Envy merges them from bottom to top, and the higher one wins when a
            name appears twice.
          </Idea>
          <Idea term="Version">
            Every save is a new numbered version of one environment, encrypted as a single block.
            The server stores the block and who saved it, never what is inside.
          </Idea>
        </dl>
        <LayerDiagram />
        <p>
          Values are encrypted and decrypted only on your machine, by the CLI or the dashboard. The{" "}
          <A href="/#security">security overview</A> lists what the server can and can&apos;t see.
          The <A href={`${GITHUB_URL}/blob/main/docs/threat-model.md`}>threat model</A> has every
          detail.
        </p>
      </DocSection>

      <DocSection
        id="commands"
        title="All commands"
        lead="Add --help to any command for its options."
      >
        {COMMAND_GROUPS.map((group) => (
          <div key={group.title} className="space-y-3">
            <h3 className="text-sm font-medium">{group.title}</h3>
            <Commands rows={group.rows} />
          </div>
        ))}
      </DocSection>

      <DocSection id="help" title="If something breaks">
        <CopyCommand command="envy doctor" />
        <p>
          Checks the server, your sign-in, the keychain, the project link and your access, and says
          what to fix. Add <Code>--debug</Code> to any command for technical details.
        </p>
        <p>
          Still stuck? <A href={`${GITHUB_URL}/issues`}>Open an issue</A>. Never paste secret
          values, tokens or your recovery key into it.
        </p>
      </DocSection>
    </>
  );
}

function Idea({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-6">
      <dt className="font-medium">{term}</dt>
      <dd className="text-muted-foreground">{children}</dd>
    </div>
  );
}

/** The three layers an app in a monorepo reads, highest first. */
function LayerDiagram() {
  const layers = [
    { name: "web/development", note: "the app's own values", wins: true },
    { name: "development", note: "every app in this stage" },
    { name: "shared", note: "every app, every stage" },
  ];
  return (
    <figure className="rounded-lg border bg-card p-4 shadow-xs sm:p-5">
      <ol className="space-y-1.5">
        {layers.map((layer, index) => (
          <li
            key={layer.name}
            style={{ marginLeft: `${index * 0.75}rem`, marginRight: `${index * 0.75}rem` }}
            className={
              layer.wins
                ? "flex items-center justify-between gap-3 rounded-md border border-brand/30 bg-brand/5 px-3 py-2"
                : "flex items-center justify-between gap-3 rounded-md border bg-muted/50 px-3 py-2"
            }
          >
            <span className="font-mono text-[0.8125rem]">{layer.name}</span>
            <span className="text-right text-xs text-muted-foreground">{layer.note}</span>
          </li>
        ))}
      </ol>
      <figcaption className="mt-3 text-sm text-muted-foreground">
        What the web app in a monorepo gets in development. The top layer wins. A project without
        apps has just the bottom two.
      </figcaption>
    </figure>
  );
}

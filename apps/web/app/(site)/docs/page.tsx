import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { InlineCode } from "@/components/inline-code";
import { CopyCommand } from "@/components/site/copy-command";
import { GITHUB_URL, INSTALL_COMMAND, RELEASES_URL } from "@/components/site/links";

export const metadata = { title: "Docs · Envy" };

const SECTIONS = [
  { id: "install", title: "Install" },
  { id: "sign-in", title: "Sign in" },
  { id: "project", title: "Link a project" },
  { id: "run", title: "Run your app" },
  { id: "values", title: "Change values" },
  { id: "environments", title: "Environments" },
  { id: "monorepo", title: "Monorepos" },
  { id: "team", title: "Add your team" },
  { id: "ci", title: "Use it in CI" },
  { id: "help", title: "If something breaks" },
];

const CI_EXAMPLE = `- name: Install envy
  run: |
    curl -fsSL https://envy.thakur.dev/install.sh | sh
    echo "$HOME/.local/bin" >> "$GITHUB_PATH"
- run: envy run -- bun test
  env:
    ENVY_TOKEN: \${{ secrets.ENVY_TOKEN }}`;

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-16">
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-24">
          <p className="mb-3 text-xs font-medium text-muted-foreground">On this page</p>
          <ul className="space-y-0.5 border-l text-sm">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-3.5 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <main className="min-w-0 max-w-2xl space-y-16">
        <header className="space-y-3 border-b pb-10">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Docs</h1>
          <p className="text-lg text-pretty text-muted-foreground">
            Everything you need to start. Set up once, then you mostly type <Code>envy run</Code> or{" "}
            <Code>envy pull</Code>.
          </p>
        </header>

        <Section id="install" title="Install">
          <p>On macOS and Linux:</p>
          <CopyCommand command={INSTALL_COMMAND} />
          <p>
            The script checks the download before installing it. On Windows, get{" "}
            <Code>envy-windows-x64.exe</Code> from the <A href={RELEASES_URL}>latest release</A>.
            Update any time with <Code>envy upgrade</Code>.
          </p>
          <p>
            The install script and <Code>envy upgrade</Code> each send one anonymous count: install,
            update or upgrade, the version, your OS and CPU, and whether it ran in CI. Nothing about
            you, your projects or your secrets, and no other command ever calls home. Set{" "}
            <Code>DO_NOT_TRACK=1</Code> (or <Code>ENVY_NO_ANALYTICS=1</Code>) to turn it off.
          </p>
        </Section>

        <Section id="sign-in" title="Sign in">
          <CopyCommand command="envy login" />
          <p>
            Your browser opens GitHub. Approve it, then pick a master password. It never leaves your
            computer.
          </p>
          <p>
            You will see a recovery key once. Write it down. If you lose both the password and the
            key, nobody can get your secrets back, not even us.
          </p>
        </Section>

        <Section id="project" title="Link a project">
          <p>In your project folder:</p>
          <CopyCommand command="envy init" />
          <p>This does three things:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>creates the project and uploads your existing .env files</li>
            <li>
              writes <Code>.envy.json</Code>. Commit it, it has no secrets in it
            </li>
            <li>
              adds .env files to <Code>.gitignore</Code>
            </li>
          </ul>
        </Section>

        <Section id="run" title="Run your app">
          <CopyCommand command="envy run -- npm start" />
          <p>
            Starts your command with the variables set. Nothing is written to disk. If you need a
            real file instead:
          </p>
          <CopyCommand command="envy pull" />
        </Section>

        <Section id="values" title="Change values">
          <Commands
            rows={[
              ["envy set API_KEY", "set one value (asks for it, hidden)"],
              ["envy unset API_KEY", "remove a value"],
              ["envy get API_KEY", "print one value"],
              ["envy push", "upload your .env (shows what changed first)"],
              ["envy history", "see past versions"],
              ["envy rollback 3", "go back to version 3"],
            ]}
          />
          <p>Every change is a new version, so nothing is lost.</p>
        </Section>

        <Section id="environments" title="Environments">
          <p>
            Each project starts with <Code>development</Code>, <Code>staging</Code> and{" "}
            <Code>production</Code>. Values in <Code>shared</Code> go to all of them, so you set
            them once; a value with the same name in an environment wins. The dashboard lists them
            under each environment as inherited.
          </p>
          <Commands
            rows={[
              ["envy run --env staging -- npm start", "use another environment once"],
              ["envy use staging", "make it the default for this folder"],
              ["envy env ls", "list environments"],
              ["envy env add preview", "add a new one"],
            ]}
          />
        </Section>

        <Section id="monorepo" title="Monorepos">
          <p>
            Run <Code>envy init</Code> at the repo root. It finds your workspace folders and makes
            each one an app with its own <Code>.env</Code> file.
          </p>
          <p>
            An app gets three layers: <Code>shared</Code>, then the root stage (such as{" "}
            <Code>development</Code>), then its own. Inside an app&apos;s folder, every command uses
            that app.
          </p>
          <Commands
            rows={[
              ["envy pull", "at the root: write every app's .env"],
              ["envy push", "at the root: save every changed app, all or nothing"],
              ["envy run --app web -- npm run dev", "run one app from anywhere"],
              ["envy apps add packages/worker", "make another folder an app"],
            ]}
          />
        </Section>

        <Section id="team" title="Add your team">
          <CopyCommand command="envy members invite sam@example.com" />
          <p>
            Send Sam the link it prints. Sam installs envy, runs <Code>envy login</Code>, then{" "}
            <Code>envy accept &lt;link&gt;</Code>. That shows Sam a short code.
          </p>
          <CopyCommand command="envy members grant" />
          <p>
            You see a code too. Check with Sam that both match, then confirm. Sam can now clone the
            repo and run <Code>envy pull</Code>.
          </p>
          <p>
            To remove someone: <Code>envy members rm sam</Code>. Envy changes every key so they
            can&apos;t read new values. Change the real passwords and API keys they had too.
          </p>
          <p className="text-muted-foreground">
            Roles: owner and admin manage people, member can change values, viewer can only read.
          </p>
        </Section>

        <Section id="ci" title="Use it in CI">
          <p>Make a read-only token for the environment your CI needs. It is shown once:</p>
          <CopyCommand command="envy token create --env staging --name github-actions --expires 90d" />
          <p>
            Save it as a repository secret called <Code>ENVY_TOKEN</Code>. Then in GitHub Actions:
          </p>
          <CodeBlock title=".github/workflows/test.yml" code={CI_EXAMPLE} />
          <p>
            The token can only read that environment and the layers under it. Remove it with{" "}
            <Code>envy token revoke github-actions</Code>.
          </p>
        </Section>

        <Section id="help" title="If something breaks">
          <CopyCommand command="envy doctor" />
          <p>
            Checks your sign-in, the project link and your access, and says what to fix. Run{" "}
            <Code>envy</Code> on its own for a menu, or <Code>envy --help</Code> for every command.
            Still stuck? <A href={`${GITHUB_URL}/issues`}>Open an issue</A>.
          </p>
        </Section>
      </main>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-title`} className="text-xl font-semibold tracking-tight">
        <a href={`#${id}`} className="transition-colors hover:text-muted-foreground">
          {title}
        </a>
      </h2>
      <div className="space-y-4 leading-7 text-pretty">{children}</div>
    </section>
  );
}

function Commands({ rows }: { rows: [command: string, meaning: string][] }) {
  return (
    <dl className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs">
      {rows.map(([command, meaning]) => (
        <div key={command} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6">
          <dt className="scrollbar-none overflow-x-auto font-mono text-sm whitespace-nowrap sm:w-72 sm:shrink-0">
            {command}
          </dt>
          <dd className="text-sm text-muted-foreground">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

const Code = InlineCode;

/** A file shown in a dark box, as in an editor, with a button that copies it. */
function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-code-border bg-code text-code-foreground shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-code-border py-1.5 pr-1.5 pl-4">
        <span className="truncate font-mono text-xs text-code-muted">{title}</span>
        <CopyButton
          text={code}
          label="example"
          variant="ghost"
          size="icon-sm"
          className="text-code-muted hover:bg-code-foreground/10 hover:text-code-foreground dark:hover:bg-code-foreground/10"
        />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-sm leading-6">{code}</pre>
    </div>
  );
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

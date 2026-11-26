import { CopyCommand } from "@/components/site/copy-command";
import {
  A,
  Code,
  CodeBlock,
  Commands,
  DocSection,
  GroupTitle,
  Note,
} from "@/components/site/docs/blocks";
import { DocsMobileNav, DocsSidebar } from "@/components/site/docs/docs-nav";
import { ReferenceDocs } from "@/components/site/docs/reference-docs";
import { TeamDocs } from "@/components/site/docs/team-docs";
import { INSTALL_COMMAND, RELEASES_URL } from "@/components/site/links";
import { TerminalWindow } from "@/components/site/terminal";

export const metadata = { title: "Docs · Envy" };

const LINK_FILE_EXAMPLE = `{
  "projectId": "0193f4c2-…",
  "defaultEnvironment": "development",
  "file": ".env",
  "branches": { "main": "production" }
}`;

export default function DocsPage() {
  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-x-16 px-4 sm:px-6 lg:grid-cols-[11rem_minmax(0,1fr)]">
      <aside className="hidden py-16 lg:block">
        <DocsSidebar />
      </aside>

      <main className="min-w-0 pb-24 lg:pt-16">
        {/* Sticky here, not inside: a sticky element can't leave its parent. */}
        <div className="sticky top-14 z-30 lg:hidden">
          <DocsMobileNav />
        </div>
        <header className="max-w-2xl pt-10 pb-12 lg:pt-0">
          <p className="font-mono text-xs text-brand">Docs</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Using Envy</h1>
          <p className="mt-4 text-lg leading-8 text-pretty text-muted-foreground">
            Envy keeps your team&apos;s .env files in sync and encrypted. Set it up once per
            project. After that you mostly type <Code>envy run</Code>, and <Code>envy pull</Code>{" "}
            when something changes.
          </p>
        </header>

        <div className="max-w-2xl space-y-16">
          <GroupTitle>Get started</GroupTitle>

          <DocSection
            id="quick-start"
            title="Quick start"
            lead="The whole setup, start to finish. Each step is explained below."
          >
            <TerminalWindow
              title="~/my-app"
              lines={[
                { kind: "comment", text: "1. install the CLI" },
                { kind: "command", text: INSTALL_COMMAND },
                { kind: "comment", text: "2. sign in with GitHub and pick a master password" },
                { kind: "command", text: "envy login" },
                { kind: "comment", text: "3. in your project folder: upload your .env files" },
                { kind: "command", text: "envy init" },
                { kind: "comment", text: "4. start your app with the variables set" },
                { kind: "command", text: "envy run -- npm run dev" },
              ]}
            />
            <p>
              Your teammates do steps 1 and 2, accept your invite, then run <Code>envy pull</Code>{" "}
              or <Code>envy run</Code> in their clone. See <A href="#team">Add a teammate</A>.
            </p>
          </DocSection>

          <DocSection id="install" title="Install">
            <p>On macOS and Linux:</p>
            <CopyCommand command={INSTALL_COMMAND} />
            <p>
              The script checks the download before installing it. On Windows, get{" "}
              <Code>envy-windows-x64.exe</Code> from the <A href={RELEASES_URL}>latest release</A>.
              Update any time with <Code>envy upgrade</Code>.
            </p>
            <Note title="One anonymous count">
              The install script and <Code>envy upgrade</Code> each send one count: install, update
              or upgrade, the version, your OS and CPU, and whether it ran in CI. Nothing about you,
              your projects or your secrets, and no other command calls home. Set{" "}
              <Code>DO_NOT_TRACK=1</Code> to turn it off.
            </Note>
          </DocSection>

          <DocSection id="sign-in" title="Sign in">
            <CopyCommand command="envy login" />
            <p>
              Envy copies a short sign-in code to your clipboard and opens GitHub. Paste it and
              approve. The first time, you then choose a master password. It never leaves your
              computer: it unlocks your keys, which unlock your secrets.
            </p>
            <p>
              On a new computer, <Code>envy login</Code> asks for the same master password to unlock
              your keys there.
            </p>
            <Note kind="warning" title="Write down your recovery key">
              You see it once, at your first sign-in. If you forget your master password,{" "}
              <Code>envy recover</Code> uses it to set a new one. If you lose both, nobody can get
              your copy back, not even us.
            </Note>
            <Commands
              rows={[
                ["envy password", "change your master password on every device"],
                ["envy recover", "set a new master password with your recovery key"],
                ["envy logout", "sign this device out and remove its keys"],
              ]}
            />
          </DocSection>

          <DocSection id="project" title="Link a project">
            <p>In your project folder:</p>
            <CopyCommand command="envy init" />
            <p>It creates a project (or links to one), then:</p>
            <ul>
              <li>
                imports <Code>.env</Code> into development, and <Code>.env.staging</Code> into
                staging, and so on. Example, sample, template and <Code>.local</Code> files are
                never imported
              </li>
              <li>
                writes <Code>.envy.json</Code>. Commit it: it says which project the folder uses and
                holds no secrets
              </li>
              <li>
                adds .env files to <Code>.gitignore</Code>
              </li>
            </ul>
            <CodeBlock title=".envy.json" code={LINK_FILE_EXAMPLE} />
            <p className="text-sm text-muted-foreground">
              <Code>branches</Code> is optional: on the <Code>main</Code> git branch, commands use
              production unless you say otherwise.
            </p>
          </DocSection>

          <DocSection id="run" title="Run your app">
            <CopyCommand command="envy run -- npm run dev" />
            <p>
              Starts your command with the variables set. Nothing is written to disk. Your
              command&apos;s exit code and Ctrl+C pass straight through.
            </p>
            <p>When a tool needs a real file instead:</p>
            <CopyCommand command="envy pull" />
            <p>
              It writes <Code>.env</Code> readable only by you, lists which names changed, and warns
              about names in <Code>.env.example</Code> that nobody has set.
            </p>
          </DocSection>

          <GroupTitle>Every day</GroupTitle>

          <DocSection id="values" title="Change values">
            <Commands
              rows={[
                ["envy set API_KEY", "set one value; asks for it without showing it"],
                ["envy set A=1 B=2", "set several at once"],
                ["envy unset API_KEY", "remove a value"],
                ["envy get API_KEY", "print one value (the only command that prints values)"],
                ["envy push", "upload your edited .env, after showing which names change"],
              ]}
            />
            <p>
              Every change is saved as a new version. If a teammate pushed after your last pull,{" "}
              <Code>envy push</Code> asks before replacing their version. In CI it stops unless you
              add <Code>--force</Code>.
            </p>
          </DocSection>

          <DocSection id="environments" title="Environments">
            <p>
              Each project starts with <Code>development</Code>, <Code>staging</Code> and{" "}
              <Code>production</Code>. Values in <Code>shared</Code> go to all of them, so you set
              them once. A value with the same name in an environment wins.
            </p>
            <Commands
              rows={[
                ["envy run --env staging -- npm start", "use another environment once"],
                ["envy use staging", "make it the default for this folder"],
                ["envy env ls", "list environments and their latest version"],
                ["envy env add preview", "add a new one"],
                ["envy env add prod-eu --protected", "add one that always needs --env and a yes"],
              ]}
            />
            <p>
              Which one a command uses, first match wins: <Code>--env</Code>, then{" "}
              <Code>ENVY_ENV</Code>, then the <Code>branches</Code> map in <Code>.envy.json</Code>,
              then the folder&apos;s default.
            </p>
          </DocSection>

          <DocSection id="history" title="History and rollback">
            <Commands
              rows={[
                ["envy history", "versions, who saved each one, and the note"],
                ['envy push -m "rotate stripe key"', "add a note to a version"],
                ["envy rollback 7", "show what would change, then save version 7 again"],
              ]}
            />
            <p>A rollback adds a new version, so nothing is ever deleted.</p>
          </DocSection>

          <DocSection id="monorepo" title="Monorepos">
            <p>
              Run <Code>envy init</Code> at the repo root. It finds your workspace folders and
              offers to make each one an app with its own <Code>.env</Code> and environments. Inside
              an app&apos;s folder, every command uses that app.
            </p>
            <Commands
              rows={[
                ["envy pull", "at the root: write every app's .env"],
                ["envy push", "at the root: save every changed app, all or nothing"],
                ["envy run --app web -- npm run dev", "run one app from anywhere"],
                ["envy apps add packages/worker", "make another folder an app"],
              ]}
            />
            <p>
              An app reads three layers. See <A href="#how-it-works">How it works</A>.
            </p>
          </DocSection>

          <TeamDocs />
          <ReferenceDocs />
        </div>
      </main>
    </div>
  );
}

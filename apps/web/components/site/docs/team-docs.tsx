import { CopyCommand } from "@/components/site/copy-command";
import { INSTALL_COMMAND } from "@/components/site/links";
import { Code, CodeBlock, Commands, DocSection, GroupTitle, Note } from "./blocks";

const CI_EXAMPLE = `- name: Install envy
  run: |
    ${INSTALL_COMMAND}
    echo "$HOME/.local/bin" >> "$GITHUB_PATH"
- run: envy run -- bun test
  env:
    ENVY_TOKEN: \${{ secrets.ENVY_TOKEN }}`;

/** The Team and the CI and scripts groups of the docs page. */
export function TeamDocs() {
  return (
    <>
      <GroupTitle>Team</GroupTitle>

      <DocSection
        id="team"
        title="Add a teammate"
        lead="Three steps. The last one happens on your machine, because only you can unlock the keys to share."
      >
        <ol className="space-y-6">
          <Step number={1} title="Invite them">
            <CopyCommand command="envy members invite sam@example.com" />
            <p>
              Send Sam the link it prints. It works once, for 7 days, and only for the GitHub
              account with that email.
            </p>
          </Step>
          <Step number={2} title="They accept">
            <p>
              Sam installs envy, runs <Code>envy login</Code>, then{" "}
              <Code>envy accept &lt;link&gt;</Code>. Sam now sees a short code: their key
              fingerprint.
            </p>
          </Step>
          <Step number={3} title="You give access">
            <CopyCommand command="envy members grant" />
            <p>
              You see a code too. Check with Sam, on a call or in person, that both match, then
              confirm. Sam can now run <Code>envy pull</Code>.
            </p>
          </Step>
        </ol>
        <Note title="Why compare codes?">
          The code proves the key you are about to trust is really Sam&apos;s. Without the check, a
          hacked server could hand you its own key instead and read what you share.
        </Note>
        <Commands
          rows={[
            ["owner, admin", "manage people, tokens and environments"],
            ["member", "read and change values"],
            ["viewer", "read values only"],
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Pick a role with <Code>--role</Code> when inviting, or later with{" "}
          <Code>envy members role sam viewer</Code>. The dashboard&apos;s Members page does all of
          this too.
        </p>
      </DocSection>

      <DocSection
        id="access"
        title="Limit access"
        lead="A role says what someone can do. Access says where, for example a contractor who gets development only."
      >
        <Commands
          rows={[
            ["envy members grant sam --access development", "give access to development only"],
            ["envy members access sam development,staging", "change it later"],
            ["envy members access sam all", "every environment again"],
          ]}
        />
        <p>
          Shared is always included. They only ever receive the keys of their environments, so even
          a hacked server can&apos;t show them the others. Admins and owners always have every
          environment, because they manage the keys.
        </p>
      </DocSection>

      <DocSection id="remove" title="Remove someone">
        <CopyCommand command="envy members rm sam" />
        <p>
          Envy gives every environment Sam could read a new key, re-encrypts the latest values, and
          revokes the CI tokens Sam made. Sam can&apos;t read anything saved after this.
        </p>
        <Note kind="warning" title="Change the real credentials too">
          Sam may still have copies of what they pulled before. For anything that matters, rotate
          the actual passwords and API keys, then <Code>envy set</Code> the new ones.
        </Note>
      </DocSection>

      <GroupTitle>CI and scripts</GroupTitle>

      <DocSection
        id="ci"
        title="Use it in CI"
        lead="A service token reads one environment, and nothing else. No sign-in or master password needed."
      >
        <CopyCommand command="envy token create --env staging --name github-actions --expires 90d" />
        <p>
          The token is shown once. Save it as a repository secret called <Code>ENVY_TOKEN</Code>,
          then in GitHub Actions:
        </p>
        <CodeBlock title=".github/workflows/test.yml" code={CI_EXAMPLE} />
        <p>
          With <Code>ENVY_TOKEN</Code> set, <Code>envy run</Code> and <Code>envy pull</Code> need no{" "}
          <Code>.envy.json</Code>. The token reads its environment plus the layers under it, so CI
          gets the same values you do.
        </p>
        <Commands
          rows={[
            ["envy token ls", "list tokens and when each was last used"],
            ["envy token revoke github-actions", "stop a token at once"],
          ]}
        />
      </DocSection>

      <DocSection id="scripts" title="Settings for scripts">
        <p>Every setting can come from an environment variable:</p>
        <Commands
          rows={[
            ["ENVY_TOKEN", "a service token; used instead of signing in"],
            ["ENVY_ENV", "the environment to use, like --env"],
            ["ENVY_API_URL", "your own Envy server"],
            ["ENVY_MASTER_PASSWORD", "unlock without a prompt (keep it out of shell history)"],
            ["ENVY_KEYSTORE=file", "keep keys in a file instead of the system keychain"],
            ["ENVY_CONFIG_DIR", "where settings live (default ~/.config/envy)"],
            ["ENVY_NO_BROWSER=1", "print the sign-in address instead of opening it"],
            ["ENVY_DEBUG=1", "show technical details when something fails"],
            ["DO_NOT_TRACK=1", "skip the anonymous install and upgrade count"],
          ]}
        />
        <p>
          List commands take <Code>--json</Code>. Exit codes: 0 worked, 1 a problem with your input,
          2 sign-in, 3 network or server. <Code>envy run</Code> passes on your command&apos;s own
          code.
        </p>
      </DocSection>
    </>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3">
      <span className="flex size-6 items-center justify-center rounded-full border bg-card font-mono text-xs text-muted-foreground">
        {number}
      </span>
      <div className="min-w-0 space-y-3">
        <p className="font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

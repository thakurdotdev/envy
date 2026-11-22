#!/usr/bin/env bun
import { CryptoError } from "@envy/crypto";
import { CLI_COMMAND } from "@envy/shared";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { init } from "./commands/init.ts";
import { login } from "./commands/login.ts";
import { logout } from "./commands/logout.ts";
import { pull } from "./commands/pull.ts";
import { push } from "./commands/push.ts";
import { run } from "./commands/run.ts";
import { useEnvironment } from "./commands/use.ts";
import { getVariable, setVariables, unsetVariables } from "./commands/variables.ts";
import { acceptInvite } from "./commands/accept.ts";
import { history, rollback } from "./commands/history.ts";
import {
  changeRole,
  grantPending,
  inviteMember,
  listTeam,
  removeFromTeam,
} from "./commands/members.ts";
import { completion } from "./commands/completion.ts";
import { doctor } from "./commands/doctor.ts";
import { addEnvironment, listProjectEnvironments } from "./commands/environments.ts";
import { menu } from "./commands/menu.ts";
import { createToken, listTokens, revokeToken } from "./commands/token.ts";
import { upgrade } from "./commands/upgrade.ts";
import { CliError, EXIT_CODES } from "./core/errors.ts";
import { output } from "./ui/output.ts";

const program = new Command(CLI_COMMAND)
  .description("Share .env secrets with your team. Encrypted on your machine.")
  .version(packageJson.version)
  .option("--debug", "show technical details when something goes wrong")
  // Lets `envy run -- cmd --flag` pass --flag to cmd instead of reading it.
  .enablePositionalOptions();

const environmentOption = [
  "-e, --env <name>",
  "environment to use (default: from .envy.json)",
] as const;
const yesOption = ["-y, --yes", "answer yes to confirmations (for scripts and CI)"] as const;
const jsonOption = ["--json", "print machine-readable JSON"] as const;

program
  .command("login")
  .description("sign in with GitHub and unlock your keys on this device")
  .option("--api-url <url>", "use your own Envy server")
  .action(login);

program
  .command("logout")
  .description("sign out and remove your keys from this device")
  .action(logout);

program
  .command("init")
  .description("link this folder to a project and import its .env files")
  .option("--project <name>", "link to an existing project (name or id)")
  .option("--create <name>", "create a new project with this name")
  .option(...yesOption)
  .option("--force", "replace an existing .envy.json")
  .action(init);

program
  .command("pull")
  .description("write the environment's variables to the local .env file")
  .option(...environmentOption)
  .option(...yesOption)
  .action(pull);

program
  .command("push")
  .description("upload the local .env file as a new version")
  .option(...environmentOption)
  .option(...yesOption)
  .option("-m, --message <text>", "note to show in envy history")
  .option("--force", "replace a version someone pushed after your last pull")
  .action(push);

program
  .command("run")
  .description("run a command with the variables injected (nothing is written to disk)")
  .argument("<command...>", "the command, after --")
  .option(...environmentOption)
  .option(...yesOption)
  .passThroughOptions()
  .action(run);

program
  .command("set")
  .description("set variables: envy set KEY=value, or envy set KEY to type the value hidden")
  .argument("<assignments...>")
  .option(...environmentOption)
  .option(...yesOption)
  .action(setVariables);

program
  .command("unset")
  .description("remove variables")
  .argument("<keys...>")
  .option(...environmentOption)
  .option(...yesOption)
  .action(unsetVariables);

program
  .command("get")
  .description("print one value")
  .argument("<key>")
  .option(...environmentOption)
  .option(...yesOption)
  .option(...jsonOption)
  .action(getVariable);

program
  .command("use")
  .description("set the default environment for this folder")
  .argument("<environment>")
  .action(useEnvironment);

program
  .command("history")
  .description("list the versions of an environment")
  .option(...environmentOption)
  .option(...yesOption)
  .option("-n, --limit <count>", "how many versions to show", "20")
  .option(...jsonOption)
  .action(history);

program
  .command("rollback")
  .description("make an old version the current one (saved as a new version)")
  .argument("<version>")
  .option(...environmentOption)
  .option(...yesOption)
  .action(rollback);

const members = program.command("members").description("manage who can read this project");
members
  .command("ls")
  .description("list members with their key fingerprints")
  .option(...jsonOption)
  .action(listTeam);
members
  .command("invite")
  .description("invite someone by email; prints a link to send them")
  .argument("<email>")
  .option("-r, --role <role>", "admin, member or viewer", "member")
  .action(inviteMember);
members
  .command("grant")
  .description("give waiting members the keys (after checking their fingerprint)")
  .argument("[member]", "GitHub login or email; leave out for everyone waiting")
  .option(...yesOption)
  .action(grantPending);
members
  .command("rm")
  .description("remove a member and change every environment key")
  .argument("<member>")
  .option(...yesOption)
  .action(removeFromTeam);
members
  .command("role")
  .description("change a member's role")
  .argument("<member>")
  .argument("<role>", "admin, member or viewer")
  .action(changeRole);

program
  .command("accept")
  .description("join a project with the invite link you were sent")
  .argument("<link>")
  .action(acceptInvite);

const environments = program.command("env").description("list and add environments");
environments
  .command("ls")
  .description("list environments")
  .option(...jsonOption)
  .action(listProjectEnvironments);
environments
  .command("add")
  .description("add an environment (keys are wrapped for every member)")
  .argument("<name>")
  .option("--protected", "needs --env and a confirmation every time, like production")
  .action(addEnvironment);

const tokens = program.command("token").description("read-only service tokens for CI");
tokens
  .command("create")
  .description("make a token that can read one environment (shown once)")
  .option(...environmentOption)
  .option(...yesOption)
  .option("--name <name>", "a name to recognise it by, such as github-actions")
  .option("--expires <days>", "stop working after this long, for example 90d")
  .action(createToken);
tokens
  .command("ls")
  .description("list service tokens")
  .option(...jsonOption)
  .action(listTokens);
tokens
  .command("revoke")
  .description("stop a token from working")
  .argument("<name>")
  .action(revokeToken);

program
  .command("upgrade")
  .description("install the latest envy release (checksum verified)")
  .action(upgrade);

program
  .command("doctor")
  .description("check sign-in, project link, .gitignore, keychain, server and missing keys")
  .option(...jsonOption)
  .action(doctor);

program
  .command("completion")
  .description("print a shell completion script")
  .argument("<shell>", "bash, zsh or fish")
  .action((shell: string) => completion(program, shell));

// `envy` alone: a menu in a terminal, the help text otherwise.
program.action(async () => {
  await menu(
    (args) => program.parseAsync(["node", "envy", ...args]).then(() => undefined),
    () => program.outputHelp(),
  );
});

function handleError(error: unknown): never {
  const debug = program.opts()["debug"] === true || process.env["ENVY_DEBUG"] === "1";
  if (error instanceof CliError) {
    output.error(error.message, error.hint);
    if (debug && error.apiCode !== undefined) {
      output.info(output.dim(`API error code: ${error.apiCode}`));
    }
    process.exit(error.exitCode);
  }
  if (error instanceof CryptoError) {
    output.error(
      "Could not decrypt the data. It may have been changed, or your key is out of date.",
      "Run envy login again. If it keeps happening, tell a project admin.",
    );
  } else {
    output.error(
      "Something went wrong inside envy.",
      "Run it again with ENVY_DEBUG=1 to see details.",
    );
  }
  if (debug && error instanceof Error) {
    output.info(output.dim(error.stack ?? error.message));
  }
  process.exit(EXIT_CODES.userError);
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  handleError(error);
}

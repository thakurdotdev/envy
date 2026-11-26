#!/usr/bin/env bun
import { CryptoError } from "@envy/crypto";
import { CLI_COMMAND } from "@envy/shared";
import { Command } from "commander";
import packageJson from "../package.json" with { type: "json" };
import { init } from "./commands/init.ts";
import { changeMasterPassword, recoverWithRecoveryKey } from "./commands/keys.ts";
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
  changeAccess,
  changeRole,
  grantPending,
  inviteMember,
  listTeam,
  removeFromTeam,
} from "./commands/members.ts";
import { completion } from "./commands/completion.ts";
import { doctor } from "./commands/doctor.ts";
import { deleteProject, listProjects, restoreProject } from "./commands/projects.ts";
import { addAppCommand, listProjectApps, removeAppCommand } from "./commands/apps.ts";
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
const appOption = [
  "-a, --app <name>",
  "app of a monorepo to use, or root (default: the app of the current folder)",
] as const;
const allOption = ["--all", "the root and every app, even inside an app folder"] as const;
const yesOption = ["-y, --yes", "answer yes to confirmations (for scripts and CI)"] as const;
const jsonOption = ["--json", "print machine-readable JSON"] as const;

program
  .command("login")
  .description("sign in with GitHub and unlock your keys on this device")
  .option("--api-url <url>", "use your own Envy server")
  .action(login);

program.command("password").description("change your master password").action(changeMasterPassword);

program
  .command("recover")
  .description("forgot your master password? get back in with your recovery key")
  .action(recoverWithRecoveryKey);

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
  .description(
    "write the environment's variables to the local .env file (at a monorepo root, every app's)",
  )
  .option(...environmentOption)
  .option(...appOption)
  .option(...allOption)
  .option(...yesOption)
  .action(pull);

program
  .command("push")
  .description("upload the local .env file as a new version (at a monorepo root, every app's)")
  .option(...environmentOption)
  .option(...appOption)
  .option(...allOption)
  .option(...yesOption)
  .option("-m, --message <text>", "note to show in envy history")
  .option("--force", "replace a version someone pushed after your last pull")
  .action(push);

program
  .command("run")
  .description("run a command with the variables injected (nothing is written to disk)")
  .argument("<command...>", "the command, after --")
  .option(...environmentOption)
  .option(...appOption)
  .option(...yesOption)
  .passThroughOptions()
  .action(run);

program
  .command("set")
  .description("set variables: envy set KEY=value, or envy set KEY to type the value hidden")
  .argument("<assignments...>")
  .option(...environmentOption)
  .option(...appOption)
  .option(...yesOption)
  .action(setVariables);

program
  .command("unset")
  .description("remove variables")
  .argument("<keys...>")
  .option(...environmentOption)
  .option(...appOption)
  .option(...yesOption)
  .action(unsetVariables);

program
  .command("get")
  .description("print one value")
  .argument("<key>")
  .option(...environmentOption)
  .option(...appOption)
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
  .option(...appOption)
  .option(...yesOption)
  .option("-n, --limit <count>", "how many versions to show", "20")
  .option(...jsonOption)
  .action(history);

program
  .command("rollback")
  .description("make an old version the current one (saved as a new version)")
  .argument("<version>")
  .option(...environmentOption)
  .option(...appOption)
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
  .option("--access <stages>", "only these stages, such as development,staging (default: all)")
  .option(...yesOption)
  .action(grantPending);
members
  .command("access")
  .description("choose which environments a member can read")
  .argument("<member>")
  .argument("<stages>", "all, or stages such as development,staging (shared is always included)")
  .action(changeAccess);
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

const projects = program.command("projects").description("list, delete and restore projects");
projects
  .command("ls")
  .description("list your projects")
  .option("--deleted", "list your deleted projects that can still be restored")
  .option(...jsonOption)
  .action(listProjects);
projects
  .command("rm")
  .description("delete a project (owner only; it can be restored for 30 days)")
  .argument("<project>", "name, slug or id")
  .option(...yesOption)
  .action(deleteProject);
projects
  .command("restore")
  .description("bring back a project you deleted less than 30 days ago")
  .argument("<project>", "name, slug or id")
  .action(restoreProject);

const apps = program.command("apps").description("apps of a monorepo, each with its own .env");
apps
  .command("ls")
  .description("list the apps and their folders")
  .option(...jsonOption)
  .action(listProjectApps);
apps
  .command("add")
  .description("make a folder an app, with an environment for each stage")
  .argument("<folder>")
  .option("--name <name>", "the app's name (default: the folder's name)")
  .option("--file <file>", "the file envy pull writes in the folder", ".env")
  .option("--no-inherit-root", "do not merge the root environment under the app's")
  .option(...yesOption)
  .action(addAppCommand);
apps
  .command("rm")
  .description("remove an app for everyone (its tokens stop working)")
  .argument("<name>")
  .option(...yesOption)
  .action(removeAppCommand);

const environments = program.command("env").description("list and add environments");
environments
  .command("ls")
  .description("list environments")
  .option(...jsonOption)
  .action(listProjectEnvironments);
environments
  .command("add")
  .description("add an environment to the root and every app (keys are wrapped for every member)")
  .argument("<name>")
  .option("--protected", "needs --env and a confirmation every time, like production")
  .action(addEnvironment);

const tokens = program.command("token").description("read-only service tokens for CI");
tokens
  .command("create")
  .description("make a token that can read one environment (shown once)")
  .option(...environmentOption)
  .option(...appOption)
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
  .alias("update")
  .description("update envy to the latest release (or a version you name), checksum verified")
  .argument("[version]", "a version such as 0.2.0; the latest if left out")
  .option("--check", "only say whether a new version is available")
  .option("--force", "reinstall even if this version is already installed")
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

import {
  loadEnvironmentVariables,
  openProjectContext,
  type EnvironmentOptions,
} from "../core/context.ts";
import { CliError } from "../core/errors.ts";
import { withSpinner } from "../ui/prompts.ts";
import { warnAboutMissingKeys } from "../core/example-check.ts";

const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const SIGNAL_NUMBERS: Record<string, number> = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15, SIGKILL: 9 };

/**
 * Runs a command with the environment's variables injected. Nothing is
 * written to disk. Exits with the command's own exit code.
 */
export async function run(command: string[], options: EnvironmentOptions): Promise<never> {
  if (command.length === 0) {
    throw new CliError("Say which command to run.", { hint: "For example: envy run -- npm start" });
  }
  const context = await openProjectContext(options);
  const { found, environment } = context;
  await context.unlock();
  const variables = await withSpinner(`Loading ${environment.name}`, () =>
    loadEnvironmentVariables(context),
  );

  await warnAboutMissingKeys(found.folder, environment.name, variables);

  let child: ReturnType<typeof Bun.spawn>;
  try {
    child = Bun.spawn(command, {
      env: { ...process.env, ...variables },
      stdio: ["inherit", "inherit", "inherit"],
    });
  } catch {
    throw new CliError(`Could not start "${command[0] ?? ""}".`, {
      hint: "Check the command name and that it is installed.",
    });
  }

  // Ctrl+C and stop signals go to the command, which decides how to end.
  for (const signal of FORWARDED_SIGNALS) {
    process.on(signal, () => child.kill(signal));
  }
  const exitCode = await child.exited;
  const signalName = child.signalCode;
  process.exit(signalName === null ? exitCode : 128 + (SIGNAL_NUMBERS[signalName] ?? 1));
}

import { findProjectLink } from "../core/project-link.ts";
import { askSelect, askText, isInteractive } from "../ui/prompts.ts";

/**
 * `envy` with no arguments: in a terminal, a short menu of the common
 * actions for this folder; otherwise, the help text.
 */
export async function menu(
  runCommand: (args: string[]) => Promise<void>,
  showHelp: () => void,
): Promise<void> {
  if (!isInteractive()) {
    showHelp();
    return;
  }
  const linked = (await findProjectLink()) !== undefined;
  const choices = linked
    ? [
        { value: "pull", label: "Pull", hint: "write .env" },
        { value: "push", label: "Push", hint: "upload .env as a new version" },
        { value: "run", label: "Run a command", hint: "with the variables injected" },
        { value: "history", label: "History" },
        { value: "members ls", label: "Members" },
        { value: "doctor", label: "Check my setup" },
      ]
    : [
        { value: "init", label: "Link this folder to a project" },
        { value: "login", label: "Sign in" },
        { value: "doctor", label: "Check my setup" },
      ];
  const choice = await askSelect("What do you want to do?", choices, "Run envy --help.");
  if (choice === "run") {
    const command = await askText("Command to run", "Use envy run -- <command>.");
    await runCommand(["run", "--", ...command.split(" ").filter((part) => part !== "")]);
    return;
  }
  await runCommand(choice.split(" "));
}

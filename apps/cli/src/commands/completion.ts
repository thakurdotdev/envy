import type { Command } from "commander";
import { CliError } from "../core/errors.ts";
import { output } from "../ui/output.ts";

/** Prints a completion script: `envy completion zsh >> ~/.zshrc`, for example. */
export function completion(program: Command, shell: string): void {
  const topLevel = program.commands.map((command) => command.name());
  const nested = program.commands
    .filter((command) => command.commands.length > 0)
    .map((command) => ({
      name: command.name(),
      children: command.commands.map((child) => child.name()),
    }));

  switch (shell) {
    case "bash": {
      const cases = nested.map(
        (group) =>
          `    ${group.name}) COMPREPLY=($(compgen -W "${group.children.join(" ")}" -- "$current")); return ;;`,
      );
      output.result(
        [
          "_envy_complete() {",
          '  local current="${COMP_WORDS[COMP_CWORD]}"',
          '  if [ "$COMP_CWORD" -eq 1 ]; then',
          `    COMPREPLY=($(compgen -W "${topLevel.join(" ")}" -- "$current")); return`,
          "  fi",
          '  case "${COMP_WORDS[1]}" in',
          ...cases,
          "  esac",
          "}",
          "complete -F _envy_complete envy",
        ].join("\n"),
      );
      return;
    }
    case "zsh": {
      output.result(
        [
          "#compdef envy",
          "_envy() {",
          "  if (( CURRENT == 2 )); then",
          `    compadd ${topLevel.join(" ")}`,
          "  else",
          "    case $words[2] in",
          ...nested.map((group) => `      ${group.name}) compadd ${group.children.join(" ")} ;;`),
          "    esac",
          "  fi",
          "}",
          "compdef _envy envy",
        ].join("\n"),
      );
      return;
    }
    case "fish": {
      output.result(
        [
          `complete -c envy -f -n "__fish_use_subcommand" -a "${topLevel.join(" ")}"`,
          ...nested.map(
            (group) =>
              `complete -c envy -f -n "__fish_seen_subcommand_from ${group.name}" -a "${group.children.join(" ")}"`,
          ),
        ].join("\n"),
      );
      return;
    }
    default:
      throw new CliError(`"${shell}" is not a supported shell.`, {
        hint: "Use bash, zsh or fish.",
      });
  }
}

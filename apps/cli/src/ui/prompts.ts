import * as clack from "@clack/prompts";
import { CliError } from "../core/errors.ts";

/**
 * Prompts only work when a person is at a terminal. In CI or with piped
 * input, every prompt fails with a message that names the flag or variable
 * to use instead.
 */
// Node's types say isTTY is always a boolean, but it is undefined when the
// stream is not a terminal, so it is read through this looser type.
function isTerminal(stream: { isTTY?: boolean }): boolean {
  return stream.isTTY === true;
}

export function isInteractive(): boolean {
  const isCi = process.env["CI"] === "true" || process.env["CI"] === "1";
  return !isCi && isTerminal(process.stdin) && isTerminal(process.stderr);
}

function needsInput(whatToUseInstead: string): CliError {
  return new CliError("This needs an answer, but there is no terminal to ask in.", {
    hint: whatToUseInstead,
  });
}

// clack returns a symbol when the user presses Ctrl+C or Esc.
function stopIfCancelled<Answer>(answer: Answer | symbol): Answer {
  if (typeof answer === "symbol") {
    throw new CliError("Cancelled.");
  }
  return answer;
}

export type Choice = { value: string; label: string; hint?: string };

export async function askConfirm(message: string, nonInteractiveHint: string): Promise<boolean> {
  if (!isInteractive()) {
    throw needsInput(nonInteractiveHint);
  }
  return stopIfCancelled<boolean>(await clack.confirm({ message }));
}

export async function askPassword(message: string, nonInteractiveHint: string): Promise<string> {
  if (!isInteractive()) {
    throw needsInput(nonInteractiveHint);
  }
  return stopIfCancelled<string>(await clack.password({ message }));
}

export async function askText(message: string, nonInteractiveHint: string): Promise<string> {
  if (!isInteractive()) {
    throw needsInput(nonInteractiveHint);
  }
  return stopIfCancelled<string>(await clack.text({ message }));
}

export async function askSelect(
  message: string,
  choices: Choice[],
  nonInteractiveHint: string,
): Promise<string> {
  if (!isInteractive()) {
    throw needsInput(nonInteractiveHint);
  }
  return stopIfCancelled<string>(await clack.select<string>({ message, options: choices }));
}

export async function askMultiSelect(
  message: string,
  choices: Choice[],
  nonInteractiveHint: string,
  /** The choices ticked at the start (all of them if left out). */
  initialValues: string[] = choices.map((choice) => choice.value),
): Promise<string[]> {
  if (!isInteractive()) {
    throw needsInput(nonInteractiveHint);
  }
  const answer = await clack.multiselect<string>({
    message,
    options: choices,
    initialValues,
    required: false,
  });
  return stopIfCancelled<string[]>(answer);
}

/**
 * Shows a spinner while `work` runs, but only on a terminal and only if it
 * takes longer than 300 ms, so fast commands do not flicker.
 */
export async function withSpinner<Result>(
  message: string,
  work: () => Promise<Result>,
): Promise<Result> {
  if (!isInteractive()) {
    return work();
  }
  const spinner = clack.spinner();
  let started = false;
  const timer = setTimeout(() => {
    started = true;
    spinner.start(message);
  }, 300);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
    if (started) {
      spinner.stop();
    }
  }
}

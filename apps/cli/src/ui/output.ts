import pc from "picocolors";

// All user-facing text goes through here. Results go to stdout; progress,
// warnings and errors go to stderr, so `envy get KEY > file` stays clean.
// picocolors turns colour off by itself for NO_COLOR and for non-terminals.

export const output = {
  /** The one line that ends a successful command. */
  success(message: string): void {
    process.stderr.write(`${pc.green("✔")} ${message}\n`);
  },
  info(message: string): void {
    process.stderr.write(`${message}\n`);
  },
  warn(message: string): void {
    process.stderr.write(`${pc.yellow("!")} ${message}\n`);
  },
  error(message: string, hint?: string): void {
    const hintText = hint === undefined ? "" : ` ${hint}`;
    process.stderr.write(`${pc.red("✖")} ${message}${hintText}\n`);
  },
  /** Plain data for scripts, such as the value from `envy get`. */
  result(text: string): void {
    process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
  },
  dim: (text: string) => pc.dim(text),
  bold: (text: string) => pc.bold(text),
};

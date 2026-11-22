/**
 * Copies text to the system clipboard. Best effort: returns false when no
 * clipboard tool is found or it fails, and the caller shows the text instead.
 * Only used for short-lived, non-secret text such as a sign-in code.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  for (const command of clipboardCommands()) {
    if (await runWithInput(command, text)) {
      return true;
    }
  }
  return false;
}

function clipboardCommands(): string[][] {
  if (process.platform === "darwin") {
    return [["pbcopy"]];
  }
  if (process.platform === "win32") {
    return [["clip"]];
  }
  const wayland = process.env["WAYLAND_DISPLAY"] ? [["wl-copy"]] : [];
  return [...wayland, ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];
}

async function runWithInput(command: string[], input: string): Promise<boolean> {
  const [name = "", ...args] = command;
  const executable = Bun.which(name, { PATH: process.env["PATH"] ?? "" });
  if (executable === null) {
    return false;
  }
  try {
    const child = Bun.spawn([executable, ...args], {
      stdin: "pipe",
      stdout: "ignore",
      stderr: "ignore",
    });
    void child.stdin.write(input);
    await child.stdin.end();
    // A clipboard tool that hangs (no display, for example) must not block sign-in.
    const timeout = new Promise<number>((resolve) => setTimeout(() => resolve(-1), 2000));
    const exitCode = await Promise.race([child.exited, timeout]);
    if (exitCode === -1) {
      child.kill();
    }
    return exitCode === 0;
  } catch {
    return false;
  }
}

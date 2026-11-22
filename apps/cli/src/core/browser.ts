/**
 * Opens a URL in the default browser. Best effort: if it fails, the URL is
 * already printed for the user to open. Skipped when ENVY_NO_BROWSER is set.
 */
export function openInBrowser(url: string): void {
  if (process.env["ENVY_NO_BROWSER"]) {
    return;
  }
  const command =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    const child = Bun.spawn(command, { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    child.unref();
  } catch {
    // No browser opener on this machine.
  }
}

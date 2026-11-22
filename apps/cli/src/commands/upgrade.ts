import { createHash } from "node:crypto";
import { chmod, rename, writeFile } from "node:fs/promises";
import packageJson from "../../package.json" with { type: "json" };
import { CliError, EXIT_CODES } from "../core/errors.ts";
import { output } from "../ui/output.ts";

const RELEASES_URL = "https://api.github.com/repos/thakurdotdev/envy/releases/latest";

/** The release file name for this machine, as the release workflow names them. */
export function binaryNameForThisMachine(platform = process.platform, arch = process.arch): string {
  const os = platform === "darwin" ? "darwin" : platform === "win32" ? "windows" : "linux";
  const cpu = arch === "arm64" ? "arm64" : "x64";
  return `envy-${os}-${cpu}${os === "windows" ? ".exe" : ""}`;
}

/** Finds the SHA-256 for one file in a checksums.txt (`<hash>  <file>` per line). */
export function findChecksum(checksums: string, fileName: string): string | undefined {
  for (const line of checksums.split("\n")) {
    const [hash, name] = line.trim().split(/\s+/);
    if (name === fileName && hash !== undefined && /^[0-9a-f]{64}$/.test(hash)) {
      return hash;
    }
  }
  return undefined;
}

function upgradeFailed(message: string): CliError {
  return new CliError(message, {
    exitCode: EXIT_CODES.networkError,
    hint: "Try again, or reinstall with the install script.",
  });
}

/** Downloads the latest release for this machine, checks its checksum and replaces this binary. */
export async function upgrade(): Promise<void> {
  const response = await fetch(RELEASES_URL, {
    headers: { accept: "application/vnd.github+json" },
  }).catch(() => undefined);
  if (response?.ok !== true) {
    throw upgradeFailed("Could not check for a new version.");
  }
  const release: unknown = await response.json();
  const tag =
    typeof release === "object" && release !== null && "tag_name" in release
      ? String(release.tag_name)
      : "";
  const latest = tag.replace(/^v/, "");
  if (latest === packageJson.version) {
    output.success(`envy ${packageJson.version} is the latest version.`);
    return;
  }
  if (!process.execPath.endsWith("envy") && !process.execPath.endsWith("envy.exe")) {
    throw new CliError(
      "This copy of envy was not installed as a single binary, so it cannot replace itself.",
      {
        hint: "Reinstall with the install script from the README.",
      },
    );
  }
  const base = `https://github.com/thakurdotdev/envy/releases/download/${tag}`;
  const fileName = binaryNameForThisMachine();
  const [checksumsResponse, binaryResponse] = await Promise.all([
    fetch(`${base}/checksums.txt`),
    fetch(`${base}/${fileName}`),
  ]);
  if (!checksumsResponse.ok || !binaryResponse.ok) {
    throw upgradeFailed(`Could not download envy ${latest} for this machine.`);
  }
  const expected = findChecksum(await checksumsResponse.text(), fileName);
  const binary = new Uint8Array(await binaryResponse.arrayBuffer());
  const actual = createHash("sha256").update(binary).digest("hex");
  if (expected === undefined || expected !== actual) {
    throw upgradeFailed(
      "The download does not match its published checksum, so it was not installed.",
    );
  }
  // Write next to the current binary, then swap in one step.
  const temporaryPath = `${process.execPath}.new`;
  await writeFile(temporaryPath, binary);
  await chmod(temporaryPath, 0o755);
  await rename(temporaryPath, process.execPath);
  output.success(`Upgraded envy ${packageJson.version} → ${latest}.`);
}

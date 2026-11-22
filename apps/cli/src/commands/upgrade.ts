import { createHash } from "node:crypto";
import { chmod, rename, rm, writeFile } from "node:fs/promises";
import pc from "picocolors";
import packageJson from "../../package.json" with { type: "json" };
import { analyticsAllowed, countUpgrade } from "../core/analytics.ts";
import { CliError, EXIT_CODES } from "../core/errors.ts";
import {
  binaryNameForThisMachine,
  compareVersions,
  downloadBase,
  downloadWithProgress,
  fetchLatestVersion,
  findChecksum,
  formatProgress,
  normalizeVersion,
  RELEASES_PAGE,
} from "../core/release.ts";
import { output } from "../ui/output.ts";
import { withSpinner } from "../ui/prompts.ts";

type UpgradeOptions = { check?: boolean; force?: boolean };

function upgradeFailed(message: string): CliError {
  return new CliError(message, {
    exitCode: EXIT_CODES.networkError,
    hint: "Check your connection and try again, or reinstall with the install script.",
  });
}

/**
 * `envy upgrade [version]`: shows the current and the new version, downloads
 * the new binary with a progress bar, checks its SHA-256 and swaps it in.
 */
export async function upgrade(
  requested: string | undefined,
  options: UpgradeOptions,
): Promise<void> {
  const current = packageJson.version;
  const target =
    requested === undefined
      ? await withSpinner("Checking for a new version", fetchLatestVersion).catch(() => {
          throw upgradeFailed("Could not check GitHub for a new version.");
        })
      : normalizeVersion(requested);

  const comparison = compareVersions(target, current);
  if (comparison === 0 && options.force !== true) {
    output.success(
      requested === undefined
        ? `envy ${current} is the latest version.`
        : `envy ${current} is already installed.`,
    );
    return;
  }
  if (comparison < 0 && requested === undefined && options.force !== true) {
    output.success(`envy ${current} is newer than the latest release (${target}).`);
    return;
  }
  const change = `${pc.bold(current)} → ${pc.bold(target)}`;
  if (options.check === true) {
    output.info(
      comparison > 0
        ? `A new version is available: envy ${change}`
        : `envy ${target} is not newer than your ${current}.`,
    );
    output.info(
      output.dim(`Install it with: envy upgrade${requested === undefined ? "" : ` ${target}`}`),
    );
    return;
  }
  assertIsInstalledBinary();

  const verb = comparison > 0 ? "Updating" : comparison < 0 ? "Downgrading" : "Reinstalling";
  output.info(comparison === 0 ? `${verb} envy ${pc.bold(target)}` : `${verb} envy ${change}`);
  const fileName = binaryNameForThisMachine();
  const base = downloadBase(target);
  const binary = await downloadBinary(`${base}/${fileName}`, target);
  await verifyChecksum(binary, `${base}/checksums.txt`, fileName);
  await replaceThisBinary(binary);
  output.success(
    comparison === 0 ? `Reinstalled envy ${pc.bold(target)}` : `Updated envy ${change}`,
  );
  output.info(output.dim(`What's new: ${RELEASES_PAGE}/tag/v${target}`));
  if (analyticsAllowed()) {
    output.info(
      output.dim(
        "Counted this upgrade anonymously (versions, OS and CPU). Opt out: DO_NOT_TRACK=1",
      ),
    );
    const [, os = "", arch = ""] = /^envy-([a-z]+)-([a-z0-9]+)/.exec(fileName) ?? [];
    await countUpgrade({ from: current, to: target, os, arch });
  }
}

function assertIsInstalledBinary(): void {
  const path = process.execPath;
  if (!path.endsWith("envy") && !path.endsWith("envy.exe")) {
    throw new CliError(
      "This copy of envy is not a single installed binary, so it cannot replace itself.",
      { hint: "Install it with: curl -fsSL https://envy.thakur.dev/install.sh | sh" },
    );
  }
}

async function downloadBinary(url: string, version: string): Promise<Uint8Array> {
  const showProgress = process.stderr.isTTY;
  let lastDrawn = 0;
  try {
    const bytes = await downloadWithProgress(url, (received, total) => {
      const now = Date.now();
      if (showProgress && (now - lastDrawn > 80 || received === total)) {
        lastDrawn = now;
        process.stderr.write(`\r${pc.cyan("↓")} ${formatProgress(received, total)}`);
      }
    });
    if (showProgress) {
      process.stderr.write("\r\u001B[2K");
    }
    output.success(`Downloaded envy ${version} (${formatProgress(bytes.length, undefined)})`);
    return bytes;
  } catch {
    if (showProgress) {
      process.stderr.write("\n");
    }
    throw upgradeFailed(`Could not download envy ${version} for this machine.`);
  }
}

async function verifyChecksum(binary: Uint8Array, url: string, fileName: string): Promise<void> {
  const response = await fetch(url).catch(() => undefined);
  if (response?.ok !== true) {
    throw upgradeFailed("Could not download checksums.txt to check the new version.");
  }
  const expected = findChecksum(await response.text(), fileName);
  const actual = createHash("sha256").update(binary).digest("hex");
  if (expected === undefined || expected !== actual) {
    throw upgradeFailed(
      "The download does not match its published checksum, so it was not installed.",
    );
  }
  output.success("Checksum verified");
}

/** Writes the new binary next to this one, then swaps it in with renames. */
async function replaceThisBinary(binary: Uint8Array): Promise<void> {
  const path = process.execPath;
  const newPath = `${path}.new`;
  await writeFile(newPath, binary);
  await chmod(newPath, 0o755);
  if (process.platform === "win32") {
    // Windows cannot overwrite a running program, but it can rename it.
    const oldPath = `${path}.old`;
    await rm(oldPath, { force: true });
    await rename(path, oldPath);
  }
  await rename(newPath, path);
}

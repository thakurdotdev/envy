// Finds, downloads and checks envy releases on GitHub. Used by `envy upgrade`.

export const REPOSITORY = "thakurdotdev/envy";
export const RELEASES_PAGE = `https://github.com/${REPOSITORY}/releases`;

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

/** Drops a leading "v": "v1.2.3" and "1.2.3" are the same version. */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/, "");
}

/**
 * Compares two versions like 1.2.3: negative when a is older, 0 when equal,
 * positive when a is newer. A pre-release (1.2.3-beta) is older than 1.2.3.
 */
export function compareVersions(a: string, b: string): number {
  const [aCore = "", aPre] = normalizeVersion(a).split("-", 2);
  const [bCore = "", bPre] = normalizeVersion(b).split("-", 2);
  const aParts = aCore.split(".").map(Number);
  const bParts = bCore.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (aParts[index] ?? 0) - (bParts[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  if (aPre === bPre) {
    return 0;
  }
  if (aPre === undefined) {
    return 1;
  }
  if (bPre === undefined) {
    return -1;
  }
  return aPre < bPre ? -1 : 1;
}

/**
 * The newest published version. GitHub answers /releases/latest with a
 * redirect to /releases/tag/v1.2.3, which avoids the API's rate limit.
 */
export async function fetchLatestVersion(): Promise<string> {
  const response = await fetch(`${RELEASES_PAGE}/latest`, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  const match = /\/tag\/v?([^/]+)$/.exec(location);
  if (match?.[1] === undefined) {
    throw new Error("No release found");
  }
  return normalizeVersion(match[1]);
}

/** Where a version's files are published. ENVY_UPDATE_URL overrides it for tests. */
export function downloadBase(version: string): string {
  return process.env["ENVY_UPDATE_URL"] ?? `${RELEASES_PAGE}/download/v${version}`;
}

const MEGABYTE = 1024 * 1024;

function megabytes(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}

/** One progress line, for example `━━━━━━────  62%  12.3 / 19.8 MB`. */
export function formatProgress(received: number, total: number | undefined, width = 28): string {
  if (total === undefined || total <= 0) {
    return `${megabytes(received)} MB`;
  }
  const fraction = Math.min(1, received / total);
  const filled = Math.round(fraction * width);
  const bar = "━".repeat(filled) + "─".repeat(width - filled);
  const percent = `${Math.round(fraction * 100)}%`.padStart(4);
  return `${bar} ${percent}  ${megabytes(received)} / ${megabytes(total)} MB`;
}

/** Downloads a file, calling `onProgress` as bytes arrive. */
export async function downloadWithProgress(
  url: string,
  onProgress: (received: number, total: number | undefined) => void,
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`Download failed (${response.status})`);
  }
  const length = Number(response.headers.get("content-length"));
  const total = Number.isFinite(length) && length > 0 ? length : undefined;
  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
    received += value.length;
    onProgress(received, total);
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

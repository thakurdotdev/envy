import { describe, expect, test } from "bun:test";
import {
  binaryNameForThisMachine,
  compareVersions,
  downloadWithProgress,
  findChecksum,
  formatProgress,
} from "./release.ts";

describe("release helpers", () => {
  test("names the right release file for each platform", () => {
    expect(binaryNameForThisMachine("darwin", "arm64")).toBe("envy-darwin-arm64");
    expect(binaryNameForThisMachine("linux", "x64")).toBe("envy-linux-x64");
    expect(binaryNameForThisMachine("win32", "x64")).toBe("envy-windows-x64.exe");
  });

  test("reads one file's hash from checksums.txt", () => {
    const hash = "a".repeat(64);
    const checksums = `${"b".repeat(64)}  envy-linux-x64\n${hash}  envy-darwin-arm64\n`;

    expect(findChecksum(checksums, "envy-darwin-arm64")).toBe(hash);
    expect(findChecksum(checksums, "envy-windows-x64.exe")).toBeUndefined();
    expect(findChecksum("not-a-hash  envy-linux-x64", "envy-linux-x64")).toBeUndefined();
  });

  test("compares versions by number, not as text", () => {
    expect(compareVersions("0.10.0", "0.9.0")).toBeGreaterThan(0);
    expect(compareVersions("v1.2.3", "1.2.3")).toBe(0);
    expect(compareVersions("1.2.3", "1.3.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
  });

  test("draws a progress line", () => {
    const megabyte = 1024 * 1024;
    expect(formatProgress(5 * megabyte, 10 * megabyte, 10)).toBe("━━━━━─────  50%  5.0 / 10.0 MB");
    expect(formatProgress(3 * megabyte, undefined)).toBe("3.0 MB");
  });

  test("downloads in pieces and reports progress", async () => {
    const body = new Uint8Array(200_000).fill(7);
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response(body) });
    const seen: number[] = [];
    try {
      const bytes = await downloadWithProgress(`http://127.0.0.1:${server.port}/file`, (received) =>
        seen.push(received),
      );
      expect(bytes).toEqual(body);
      expect(seen.at(-1)).toBe(body.length);
    } finally {
      await server.stop(true);
    }
  });
});

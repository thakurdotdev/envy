import { describe, expect, test } from "bun:test";
import { binaryNameForThisMachine, findChecksum } from "./upgrade.ts";

describe("upgrade helpers", () => {
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
});

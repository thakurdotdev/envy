import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyToClipboard } from "./clipboard.ts";

// A fake clipboard tool on PATH records what it was given.
let folder: string;
const originalPath = process.env["PATH"];

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "envy-clipboard-"));
  const tool = process.platform === "darwin" ? "pbcopy" : "xclip";
  await writeFile(join(folder, tool), `#!/bin/sh\ncat > "${join(folder, "copied")}"\n`);
  await chmod(join(folder, tool), 0o755);
});

afterAll(async () => {
  process.env["PATH"] = originalPath;
  await rm(folder, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("copyToClipboard", () => {
  test("hands the text to the clipboard tool", async () => {
    process.env["PATH"] = `${folder}:${originalPath ?? ""}`;
    expect(await copyToClipboard("ABCD-1234")).toBe(true);
    expect(await readFile(join(folder, "copied"), "utf8")).toBe("ABCD-1234");
  });

  test("says so when there is no clipboard tool", async () => {
    process.env["PATH"] = join(folder, "empty");
    delete process.env["WAYLAND_DISPLAY"];
    expect(await copyToClipboard("ABCD-1234")).toBe(false);
  });
});

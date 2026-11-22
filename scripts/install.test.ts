import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the real install script against a fake release served locally.

const binaryName = `envy-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
const binary = "#!/bin/sh\necho envy-test-binary\n";
let folder: string;
let server: ReturnType<typeof Bun.serve>;
let checksums = "";

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "envy-install-"));
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === `/${binaryName}`) {
        return new Response(binary);
      }
      if (path === "/checksums.txt") {
        return new Response(checksums);
      }
      return new Response("not found", { status: 404 });
    },
  });
});

afterAll(async () => {
  await server.stop(true);
  await rm(folder, { recursive: true, force: true });
});

// Async on purpose: a blocking spawn would stop this process's fake server from answering.
async function install(installDir: string) {
  const child = Bun.spawn(["sh", join(import.meta.dir, "install.sh")], {
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: folder,
      ENVY_INSTALL_DIR: installDir,
      ENVY_DOWNLOAD_URL: `http://127.0.0.1:${server.port}`,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { exitCode, stderr };
}

describe("install.sh", () => {
  test("installs a binary whose checksum matches", async () => {
    const hash = new Bun.CryptoHasher("sha256").update(binary).digest("hex");
    checksums = `${hash}  ${binaryName}\n`;
    const installDir = join(folder, "good");

    const result = await install(installDir);

    expect(result.exitCode).toBe(0);
    expect(Bun.spawnSync([join(installDir, "envy")]).stdout.toString()).toBe("envy-test-binary\n");
  });

  test("refuses a binary whose checksum does not match", async () => {
    checksums = `${"0".repeat(64)}  ${binaryName}\n`;
    const installDir = join(folder, "bad");

    const result = await install(installDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("does not match its published checksum");
    expect(await Bun.file(join(installDir, "envy")).exists()).toBe(false);
  });
});

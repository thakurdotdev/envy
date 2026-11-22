import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Runs the real install script against a fake release served locally.

const binaryName = `envy-${process.platform === "darwin" ? "darwin" : "linux"}-${process.arch === "arm64" ? "arm64" : "x64"}`;
// Like the real binary, it prints its version.
const binary = "#!/bin/sh\necho 0.2.0\n";
let folder: string;
let server: ReturnType<typeof Bun.serve>;
let checksums = "";
// What the script sent to the (fake) analytics server: body and user agent.
const counts: Array<{ body: unknown; userAgent: string }> = [];

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), "envy-install-"));
  server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/send") {
        counts.push({
          body: await request.json(),
          userAgent: request.headers.get("user-agent") ?? "",
        });
        return Response.json({});
      }
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
async function install(installDir: string, extraEnv: Record<string, string> = {}) {
  const child = Bun.spawn(["sh", join(import.meta.dir, "install.sh")], {
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: folder,
      ENVY_INSTALL_DIR: installDir,
      ENVY_DOWNLOAD_URL: `http://127.0.0.1:${server.port}`,
      ENVY_VERSION: "0.2.0",
      // Never the real analytics server from a test.
      ENVY_ANALYTICS_URL: `http://127.0.0.1:${server.port}`,
      ...extraEnv,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stderr, exitCode] = await Promise.all([new Response(child.stderr).text(), child.exited]);
  return { exitCode, stderr };
}

async function fakeInstalledVersion(installDir: string, version: string) {
  await mkdir(installDir, { recursive: true });
  await writeFile(join(installDir, "envy"), `#!/bin/sh\necho ${version}\n`);
  await chmod(join(installDir, "envy"), 0o755);
}

/** The count is sent in the background, so give it a moment to arrive. */
async function waitForCounts(expected: number) {
  for (let attempt = 0; attempt < 100 && counts.length < expected; attempt += 1) {
    await Bun.sleep(20);
  }
  return counts.splice(0);
}

describe("install.sh", () => {
  test("installs a binary whose checksum matches", async () => {
    const hash = new Bun.CryptoHasher("sha256").update(binary).digest("hex");
    checksums = `${hash}  ${binaryName}\n`;
    const installDir = join(folder, "good");

    const result = await install(installDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Installing envy 0.2.0");
    expect(result.stderr).toContain("Checksum verified");
    expect(result.stderr).toContain("envy login");
    expect(Bun.spawnSync([join(installDir, "envy")]).stdout.toString()).toBe("0.2.0\n");
  });

  test("says which version it updates from", async () => {
    const installDir = join(folder, "update");
    await fakeInstalledVersion(installDir, "0.1.0");

    const result = await install(installDir);

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Updating envy 0.1.0 → 0.2.0");
    expect(Bun.spawnSync([join(installDir, "envy")]).stdout.toString()).toBe("0.2.0\n");
  });

  test("leaves an up-to-date install alone unless forced", async () => {
    const installDir = join(folder, "current");
    await fakeInstalledVersion(installDir, "0.2.0");

    const skipped = await install(installDir, { ENVY_DOWNLOAD_URL: "http://127.0.0.1:1" });
    expect(skipped.exitCode).toBe(0);
    expect(skipped.stderr).toContain("envy 0.2.0 is already installed and up to date");

    const forced = await install(installDir, { ENVY_FORCE: "1" });
    expect(forced.exitCode).toBe(0);
    expect(forced.stderr).toContain("Updating envy 0.2.0 → 0.2.0");
  });

  test("refuses a binary whose checksum does not match", async () => {
    checksums = `${"0".repeat(64)}  ${binaryName}\n`;
    const installDir = join(folder, "bad");

    const result = await install(installDir);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("does not match its published checksum");
    expect(await Bun.file(join(installDir, "envy")).exists()).toBe(false);
  });

  test("sends one anonymous count, and none when DO_NOT_TRACK or ENVY_NO_ANALYTICS is set", async () => {
    const hash = new Bun.CryptoHasher("sha256").update(binary).digest("hex");
    checksums = `${hash}  ${binaryName}\n`;
    // Counts from the earlier tests arrive in the background; let them land first.
    await Bun.sleep(300);
    counts.splice(0);

    const fresh = await install(join(folder, "counted"), { CI: "" });
    expect(fresh.stderr).toContain("Counted this install anonymously");
    const [sent] = await waitForCounts(1);
    expect(sent?.body).toEqual({
      type: "event",
      payload: {
        website: "67b6d992-f2da-46f9-904b-43ec0114349e",
        hostname: "envy.thakur.dev",
        url: "/cli/install",
        name: "cli-install",
        data: {
          version: "0.2.0",
          os: binaryName.split("-")[1],
          arch: binaryName.split("-")[2],
          ci: false,
        },
      },
    });
    // Umami drops bot-like user agents such as curl's.
    expect(sent?.userAgent).toStartWith("envy-cli/0.2.0 (");

    const update = join(folder, "counted-update");
    await fakeInstalledVersion(update, "0.1.0");
    await install(update, { CI: "true" });
    const [updated] = await waitForCounts(1);
    expect(JSON.stringify(updated?.body)).toContain('"name":"cli-update"');
    expect(JSON.stringify(updated?.body)).toContain('"ci":true');

    for (const optOut of [{ DO_NOT_TRACK: "1" }, { ENVY_NO_ANALYTICS: "true" }]) {
      const quiet = await install(join(folder, `quiet-${Object.keys(optOut)[0]}`), optOut);
      expect(quiet.exitCode).toBe(0);
      expect(quiet.stderr).not.toContain("Counted this install");
    }
    await Bun.sleep(300);
    expect(counts).toHaveLength(0);
  });
});

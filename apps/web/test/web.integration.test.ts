import { createTestApp, makeGitHubUser, type TestApp } from "@envy/api/testing";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

// Builds the real static site and the real CLI binary, then checks two
// things the plan requires:
//   1. a secret saved in the browser decrypts in the CLI, and the reverse;
//   2. no request or response the browser makes contains a plaintext value.

const MASTER_PASSWORD = "web e2e master password";
const WEB_VALUE = "web-plaintext-marker-5d1e";
const CLI_VALUE = "cli-plaintext-marker-8b2c";
const webFolder = join(import.meta.dir, "..");
const outFolder = join(webFolder, "out");

let testApp: TestApp;
let apiUrl: string;
let webServer: ReturnType<typeof Bun.serve>;
let browser: Browser;
let workspace: string;
let cliBinary: string;
const githubUser = makeGitHubUser("web-user");
const traffic: string[] = [];

/** Serves the exported site the way a static host does: /project → project.html. */
function serveStaticSite() {
  return Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      // Stand-in for github.com: "approve" at once and send the browser back.
      if (url.pathname === "/__fake-github/authorize") {
        const state = url.searchParams.get("state") ?? "";
        return Response.redirect(
          `${apiUrl}/v1/auth/github/callback?code=browser-code&state=${state}`,
          302,
        );
      }
      const path = decodeURIComponent(url.pathname);
      const candidates =
        path === "/" ? ["/index.html"] : [path, `${path}.html`, `${path}/index.html`];
      for (const candidate of candidates) {
        const file = Bun.file(join(outFolder, candidate));
        if (!candidate.includes("..") && (await file.exists())) {
          return new Response(file);
        }
      }
      return new Response(Bun.file(join(outFolder, "404.html")), { status: 404 });
    },
  });
}

function runBuild(command: string[], cwd: string, env: Record<string, string> = {}) {
  const result = Bun.spawnSync(command, {
    cwd,
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `${command.join(" ")} failed: ${result.stderr.toString()}${result.stdout.toString()}`,
    );
  }
}

async function runEnvy(args: string[], cwd: string, home: string) {
  const child = Bun.spawn([cliBinary, ...args], {
    cwd,
    env: {
      PATH: process.env["PATH"] ?? "",
      HOME: home,
      ENVY_CONFIG_DIR: join(home, ".config", "envy"),
      ENVY_API_URL: apiUrl,
      ENVY_KEYSTORE: "file",
      ENVY_MASTER_PASSWORD: MASTER_PASSWORD,
      ENVY_NO_BROWSER: "1",
      NO_COLOR: "1",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/** Records every request and response body the page exchanges with the API. */
function recordTraffic(page: Page) {
  page.on("request", (request) => {
    traffic.push(`${request.method()} ${request.url()} ${request.postData() ?? ""}`);
  });
  page.on("response", (response) => {
    if (response.url().startsWith(apiUrl)) {
      void response.text().then(
        (body) => traffic.push(`RESPONSE ${response.url()} ${body}`),
        () => undefined,
      );
    }
  });
}

async function unlock(page: Page) {
  await page.getByLabel("Master password").fill(MASTER_PASSWORD);
  await page.getByRole("button", { name: "Unlock" }).click();
}

beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "envy-web-e2e-"));
  cliBinary = join(workspace, "envy");
  webServer = serveStaticSite();
  const webUrl = `http://127.0.0.1:${webServer.port}`;
  testApp = await createTestApp({ webUrl });
  testApp.github.autoApproveDevices(githubUser);
  testApp.github.allowWebCode("browser-code", githubUser);
  testApp.github.setAuthorizeUrl(`${webUrl}/__fake-github/authorize`);
  apiUrl = testApp.listen();

  runBuild(["bun", "run", "build"], webFolder, { NEXT_PUBLIC_API_URL: apiUrl });
  runBuild(
    [
      "bun",
      "build",
      join(webFolder, "..", "cli", "src", "index.ts"),
      "--compile",
      "--outfile",
      cliBinary,
    ],
    webFolder,
  );
  browser = await chromium.launch();
}, 300_000);

afterAll(async () => {
  await browser.close();
  await webServer.stop(true);
  await testApp.close();
  await rm(workspace, { recursive: true, force: true });
});

describe("web dashboard, end to end", () => {
  test("browser and CLI read each other's secrets, and no plaintext crosses the network", async () => {
    const page = await browser.newPage();
    recordTraffic(page);
    await page.goto(`http://127.0.0.1:${webServer.port}/projects`);
    await page.getByRole("link", { name: "Sign in with GitHub" }).click();

    // First visit: choose a master password and see the recovery key once.
    await page.getByLabel("Master password").fill(MASTER_PASSWORD);
    await page.getByLabel("Type it again").fill(MASTER_PASSWORD);
    // The eye button shows what was typed, so typos are easy to spot.
    await page.getByRole("button", { name: "Show password" }).first().click();
    expect(await page.getByLabel("Master password").getAttribute("type")).toBe("text");
    await page.getByRole("button", { name: "Set master password" }).click();
    await expectLocator(page.getByTestId("recovery-key")).toBeVisible();
    await page.getByLabel("I have saved my recovery key").check();
    await page.getByRole("button", { name: "Continue" }).click();

    await page.getByText("No projects yet").waitFor();
    await page.getByRole("button", { name: "New project" }).click();
    await page.getByLabel("Name").fill("Web App");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.getByRole("tab", { name: /development/ }).waitFor();
    const projectId = new URL(page.url()).searchParams.get("id") ?? "";

    // Text typed in the .env view becomes table rows.
    await page.getByRole("tab", { name: ".env" }).click();
    await page
      .getByLabel(".env contents")
      .fill(`# from my laptop\nFROM_WEB=${WEB_VALUE}\nexport GREETING="two words"\n`);
    await page.getByRole("tab", { name: "Table" }).click();
    await page.getByRole("button", { name: "Show GREETING" }).click();
    await expectLocator(page.getByLabel("Value of GREETING")).toHaveValue("two words");

    // Pasting KEY=value lines into a name box splits them into rows too.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page
      .getByLabel("Variable name")
      .last()
      .evaluate((input) => {
        const data = new DataTransfer();
        data.setData("text/plain", "PASTED_ONE=1\nPASTED_TWO=2");
        input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
      });
    await page.getByRole("button", { name: "Show PASTED_TWO" }).click();
    await expectLocator(page.getByLabel("Value of PASTED_TWO")).toHaveValue("2");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("button", { name: "Save new version" }).click();
    await page.getByText("Saved version 1 of development").waitFor();

    // The CLI, with the same account, decrypts what the browser wrote.
    const home = join(workspace, "home");
    const folder = join(workspace, "project");
    await mkdir(home);
    await mkdir(folder);
    await writeFile(
      join(folder, ".envy.json"),
      JSON.stringify({ projectId, defaultEnvironment: "development", file: ".env" }),
    );
    expect((await runEnvy(["login"], folder, home)).exitCode).toBe(0);
    expect((await runEnvy(["get", "FROM_WEB"], folder, home)).stdout).toBe(`${WEB_VALUE}\n`);
    const imported = await runEnvy(["get", "GREETING", "--json"], folder, home);
    expect(JSON.parse(imported.stdout)).toEqual({ GREETING: "two words" });
    expect((await runEnvy(["get", "PASTED_TWO"], folder, home)).stdout).toBe("2\n");

    // And the browser decrypts what the CLI wrote.
    expect((await runEnvy(["set", `FROM_CLI=${CLI_VALUE}`], folder, home)).exitCode).toBe(0);
    await page.reload();
    // A reload forgets the key: it lives only in the page's memory.
    await unlock(page);
    await page.getByRole("button", { name: "Show FROM_CLI" }).click();
    await expectLocator(page.getByLabel("Value of FROM_CLI")).toHaveValue(CLI_VALUE);

    // Give the last response bodies a moment to be recorded.
    await page.waitForTimeout(200);
    const everything = traffic.join("\n");
    expect(everything).toContain("/v1/environments/");
    expect(everything).not.toContain(WEB_VALUE);
    expect(everything).not.toContain(CLI_VALUE);
    expect(everything).not.toContain(MASTER_PASSWORD);
    await page.close();
  }, 120_000);
});

describe("dashboard navigation and actions", () => {
  test("pages switch without reloading, edits survive tab switches, tokens are shown once", async () => {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${webServer.port}/projects`);
    await page.getByRole("link", { name: "Sign in with GitHub" }).click();
    await unlock(page);
    await page.getByRole("link", { name: /Web App/ }).click();
    await page.getByRole("tab", { name: /development/ }).waitFor();
    // Survives only if no page change reloads the document.
    await page.evaluate(() => Object.assign(window, { envyProbe: true }));

    // Unsaved edits stay when switching environment tabs, and the tab says so.
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expectLocator(page.getByLabel("Variable name").last()).toBeFocused();
    await page.getByLabel("Variable name").last().fill("DRAFT_ONLY");
    await page.getByRole("tab", { name: /staging/ }).click();
    await page.getByRole("tab", { name: /development/ }).click();
    await expectLocator(page.getByLabel("Variable name").last()).toHaveValue("DRAFT_ONLY");
    await page.getByRole("img", { name: "unsaved changes" }).waitFor();
    await page.getByRole("button", { name: "Discard" }).click();

    // Project pages are client-side: still unlocked, same document.
    const projectNav = page.getByRole("navigation", { name: "Project" });
    await projectNav.getByRole("link", { name: "Members" }).click();
    await page.getByRole("heading", { name: "Members", exact: true }).waitFor();
    await projectNav.getByRole("link", { name: "Service tokens" }).click();
    expect(await page.evaluate(() => "envyProbe" in window)).toBe(true);

    // A new token is shown in a dialog that stays until it is stored.
    await page.getByLabel("Name").fill("ci-from-web");
    await page.getByRole("button", { name: "Create token" }).click();
    expect(await page.getByLabel("New service token").inputValue()).toMatch(/^envy_[0-9a-f]{48}_/);
    expect(await page.getByRole("button", { name: "Done" }).isDisabled()).toBe(true);
    await page.getByLabel("I have stored the token").check();
    await page.getByRole("button", { name: "Done" }).click();

    // Revoking asks first.
    await page
      .getByRole("row", { name: /ci-from-web/ })
      .getByRole("button", { name: "Revoke" })
      .click();
    await page.getByRole("button", { name: "Revoke token" }).click();
    await page
      .getByRole("row", { name: /ci-from-web/ })
      .getByText("revoked")
      .waitFor();

    // The audit log says who did it, in words.
    await projectNav.getByRole("link", { name: "Audit log" }).click();
    await page.getByRole("row", { name: /@web-user.*Revoked a service token/ }).waitFor();
    expect(await page.evaluate(() => "envyProbe" in window)).toBe(true);
    await page.close();
  }, 120_000);
});

describe("monorepo apps (ADR 0018)", () => {
  test("an app made with the CLI has its own environments behind the app picker", async () => {
    const home = join(workspace, "home");
    const repo = join(workspace, "mono");
    await mkdir(join(repo, "apps", "web"), { recursive: true });
    await writeFile(join(repo, "package.json"), JSON.stringify({ workspaces: ["apps/*"] }));
    await writeFile(join(repo, "apps", "web", ".env"), "WEB_ONLY=from-the-app\n");
    const init = await runEnvy(["init", "--create", "Mono Web", "--yes"], repo, home);
    expect(init.stderr).toContain("Added the app web");

    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${webServer.port}/projects`);
    await page.getByRole("link", { name: "Sign in with GitHub" }).click();
    await unlock(page);
    await page.getByRole("link", { name: /Mono Web/ }).click();
    await page.getByRole("tab", { name: /development/ }).waitFor();
    // The root has no WEB_ONLY; the web app does.
    await page.getByText("development has no variables yet").first().waitFor();
    await page.getByLabel("App").click();
    await page.getByRole("option", { name: "web" }).click();
    await page.getByText("Merged on top of shared and the root's development").waitFor();
    await page.getByRole("button", { name: "Show WEB_ONLY" }).click();
    await expectLocator(page.getByLabel("Value of WEB_ONLY")).toHaveValue("from-the-app");
    await page.close();
  }, 120_000);
});

// Playwright's own `expect` is not used, so this small bridge waits for
// visibility and values with bun:test assertions.
function expectLocator(locator: ReturnType<Page["getByTestId"]>) {
  return {
    async toBeVisible() {
      await locator.waitFor({ state: "visible" });
    },
    async toBeFocused() {
      const deadline = Date.now() + 5000;
      while (!(await locator.evaluate((element) => element === document.activeElement))) {
        if (Date.now() > deadline) {
          throw new Error("The element did not get the focus.");
        }
        await Bun.sleep(50);
      }
    },
    async toHaveValue(value: string) {
      await locator.waitFor();
      const deadline = Date.now() + 5000;
      while ((await locator.inputValue()) !== value && Date.now() < deadline) {
        await Bun.sleep(50);
      }
      if ((await locator.inputValue()) !== value) {
        throw new Error("The input does not have the expected value.");
      }
    },
  };
}

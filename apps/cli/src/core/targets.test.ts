import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import type { FoundProjectLink } from "./project-link.ts";
import { chooseTarget, chooseTargets } from "./targets.ts";

const repo = "/repo";
const found: FoundProjectLink = {
  folder: repo,
  path: join(repo, ".envy.json"),
  link: {
    projectId: "p",
    defaultEnvironment: "development",
    file: ".env",
    branches: {},
    apps: {
      web: { path: "apps/web", file: ".env.local", inheritRoot: true },
      admin: { path: "apps/web/admin", file: ".env", inheritRoot: true },
      api: { path: "apps/api", file: ".env", inheritRoot: false },
    },
  },
};

const labels = (targets: Array<{ label: string }>) => targets.map((target) => target.label);

describe("choosing where a command works", () => {
  test("inside an app folder, it is that app; the deepest folder wins", () => {
    expect(chooseTarget(found, undefined, "/repo/apps/web/src").label).toBe("web");
    expect(chooseTarget(found, undefined, "/repo/apps/web/admin").label).toBe("admin");
    expect(labels(chooseTargets(found, {}, "/repo/apps/api"))).toEqual(["api"]);
  });

  test("a folder that only starts with an app's name is not inside it", () => {
    expect(chooseTarget(found, undefined, "/repo/apps/website").label).toBe("root");
  });

  test("at the root, pull and push cover the root and every app", () => {
    expect(labels(chooseTargets(found, {}, repo))).toEqual(["root", "admin", "api", "web"]);
    expect(chooseTarget(found, undefined, repo).label).toBe("root");
  });

  test("--app picks one from anywhere, --all picks every one, and a wrong name says which exist", () => {
    expect(labels(chooseTargets(found, { app: "root" }, "/repo/apps/web"))).toEqual(["root"]);
    expect(labels(chooseTargets(found, { all: true }, "/repo/apps/web"))).toHaveLength(4);
    expect(() => chooseTarget(found, "mobile", repo)).toThrow('no app called "mobile"');
  });
});

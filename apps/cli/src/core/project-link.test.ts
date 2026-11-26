import { describe, expect, test } from "bun:test";
import { parseProjectLink } from "./project-link.ts";

function linkWithFile(file: string): string {
  return JSON.stringify({
    projectId: "0193a6f0-0000-7000-8000-000000000001",
    defaultEnvironment: "development",
    file,
  });
}

function withApps(apps: unknown): string {
  return JSON.stringify({
    projectId: "0193a6f0-0000-7000-8000-000000000001",
    defaultEnvironment: "development",
    apps,
  });
}

describe("parseProjectLink", () => {
  test("reads a valid file and fills in the default file name", () => {
    const link = parseProjectLink(
      JSON.stringify({
        projectId: "0193a6f0-0000-7000-8000-000000000001",
        defaultEnvironment: "development",
        branches: { staging: "staging" },
      }),
      ".envy.json",
    );

    expect(link).toEqual({
      projectId: "0193a6f0-0000-7000-8000-000000000001",
      defaultEnvironment: "development",
      file: ".env",
      branches: { staging: "staging" },
      apps: {},
    });
  });

  test("says what is wrong with a broken file", () => {
    expect(() => parseProjectLink("{", ".envy.json")).toThrow("not JSON");
    expect(() =>
      parseProjectLink('{"projectId":"x","defaultEnvironment":"d"}', ".envy.json"),
    ).toThrow('"projectId"');
    expect(() =>
      parseProjectLink(
        '{"projectId":"0193a6f0-0000-7000-8000-000000000001","defaultEnvironment":"d","branches":{"a":1}}',
        ".envy.json",
      ),
    ).toThrow('"branches.a"');
  });

  test("refuses a file outside the project folder", () => {
    for (const file of ["../.env", "/home/me/.bashrc", "C:\\Users\\me\\.env", "a/../../b"]) {
      expect(() => parseProjectLink(linkWithFile(file), ".envy.json")).toThrow('"file"');
    }
    expect(parseProjectLink(linkWithFile("apps/web/.env.local"), ".envy.json").file).toBe(
      "apps/web/.env.local",
    );
  });

  test("reads apps, fills in their defaults, and refuses folders outside the repo", () => {
    const link = parseProjectLink(
      JSON.stringify({
        projectId: "0193a6f0-0000-7000-8000-000000000001",
        defaultEnvironment: "development",
        apps: {
          web: { path: "./apps/web/", file: ".env.local" },
          api: { path: "apps/api", inheritRoot: false },
        },
      }),
      ".envy.json",
    );
    expect(link.apps).toEqual({
      web: { path: "apps/web", file: ".env.local", inheritRoot: true },
      api: { path: "apps/api", file: ".env", inheritRoot: false },
    });
    for (const path of ["../other", "/etc", ".", "apps/../../x"]) {
      expect(() => parseProjectLink(withApps({ web: { path } }), ".envy.json")).toThrow(
        '"apps.web.path"',
      );
    }
    expect(() => parseProjectLink(withApps({ root: { path: "x" } }), ".envy.json")).toThrow(
      "not a valid app name",
    );
    expect(() =>
      parseProjectLink(withApps({ a: { path: "x" }, b: { path: "./x" } }), ".envy.json"),
    ).toThrow("two apps use the folder x");
  });
});

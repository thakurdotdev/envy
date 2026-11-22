import { describe, expect, test } from "bun:test";
import { parseProjectLink } from "./project-link.ts";

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
});

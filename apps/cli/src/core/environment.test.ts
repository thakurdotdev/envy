import { describe, expect, test } from "bun:test";
import { resolveEnvironment, type EnvironmentSummary } from "./environment.ts";

function environment(name: string, isProtected = false): EnvironmentSummary {
  return {
    id: name,
    name,
    isShared: name === "shared",
    isProtected,
    currentKeyVersion: 1,
    latestVersion: 0,
  };
}

const environments = [
  environment("shared"),
  environment("development"),
  environment("staging"),
  environment("production", true),
];
const base = {
  flag: undefined,
  environmentVariable: undefined,
  gitBranch: undefined,
  branches: { "release/next": "staging", main: "production" },
  defaultEnvironment: "development",
  environments,
};

describe("resolveEnvironment", () => {
  test("follows the order --env, ENVY_ENV, branch mapping, default", () => {
    expect(resolveEnvironment(base).source).toBe("default");
    expect(resolveEnvironment({ ...base, gitBranch: "release/next" })).toMatchObject({
      source: "branch",
      environment: { name: "staging" },
    });
    expect(
      resolveEnvironment({ ...base, gitBranch: "release/next", environmentVariable: "development" })
        .source,
    ).toBe("ENVY_ENV");
    expect(
      resolveEnvironment({ ...base, environmentVariable: "staging", flag: "development" })
        .environment.name,
    ).toBe("development");
  });

  test("never picks a protected environment unless --env names it", () => {
    expect(() => resolveEnvironment({ ...base, gitBranch: "main" })).toThrow("protected");
    expect(() => resolveEnvironment({ ...base, environmentVariable: "production" })).toThrow(
      "protected",
    );
    expect(resolveEnvironment({ ...base, flag: "production" }).environment.name).toBe("production");
  });

  test("an unknown name lists the real ones", () => {
    expect(() => resolveEnvironment({ ...base, flag: "prod" })).toThrow(
      'no environment called "prod"',
    );
  });
});

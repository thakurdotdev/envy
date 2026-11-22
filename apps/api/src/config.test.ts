import { describe, expect, test } from "bun:test";
import { ConfigError, loadConfig } from "./config.ts";

const validEnvironment = {
  DATABASE_URL: "postgres://appuser:appuser@localhost:5432/envy",
  API_URL: "http://localhost:3000/",
  WEB_URL: "http://localhost:3001",
  JWT_SECRET: "x".repeat(32),
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
};

describe("loadConfig", () => {
  test("reads a valid environment and fills in defaults", () => {
    const config = loadConfig(validEnvironment);

    expect(config.port).toBe(3000);
    expect(config.environment).toBe("development");
    expect(config.apiUrl).toBe("http://localhost:3000");
    expect(config.trustProxy).toBe(false);
  });

  test("lists every problem at once and never prints secret values", () => {
    const shortSecret = "short-secret-value";
    let caught: unknown;
    try {
      loadConfig({
        ...validEnvironment,
        DATABASE_URL: "mysql://localhost",
        API_URL: undefined,
        JWT_SECRET: shortSecret,
        PORT: "70000",
        TRUST_PROXY: "yes",
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConfigError);
    if (caught instanceof ConfigError) {
      expect(caught.problems).toHaveLength(5);
      expect(caught.message).not.toContain(shortSecret);
    }
  });
});

import { describe, expect, test } from "bun:test";
import { mergeLayers, separateFromShared } from "./secrets.ts";

describe("shared layer", () => {
  const shared = { LOG_LEVEL: "info", REGION: "eu" };

  test("the environment wins over shared when merging", () => {
    expect(mergeLayers(shared, { REGION: "us", API: "x" })).toEqual({
      LOG_LEVEL: "info",
      REGION: "us",
      API: "x",
    });
  });

  test("pushing a pulled file keeps shared keys in shared", () => {
    const local = { LOG_LEVEL: "info", REGION: "us", API: "y", NEW: "1" };

    const toPush = separateFromShared({
      local,
      shared,
      remoteEnvironment: { REGION: "us", API: "x" },
    });

    // LOG_LEVEL came from shared unchanged; REGION is set in the environment itself.
    expect(toPush).toEqual({ REGION: "us", API: "y", NEW: "1" });
  });

  test("a shared key changed in the file becomes an environment override", () => {
    const toPush = separateFromShared({
      local: { LOG_LEVEL: "debug", REGION: "eu" },
      shared,
      remoteEnvironment: {},
    });

    expect(toPush).toEqual({ LOG_LEVEL: "debug" });
  });
});

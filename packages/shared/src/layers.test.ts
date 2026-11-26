import { describe, expect, test } from "bun:test";
import { layersUnder, mergeLayers, separateFromLayers } from "./layers.ts";

const shared = { id: "s", appId: null, name: "shared", isShared: true };
const rootDevelopment = { id: "d", appId: null, name: "development", isShared: false };
const rootStaging = { id: "t", appId: null, name: "staging", isShared: false };
const webDevelopment = { id: "wd", appId: "web", name: "development", isShared: false };
const all = [shared, rootDevelopment, rootStaging, webDevelopment];

describe("which layers an environment has", () => {
  test("an app stage sits on shared and the root stage of the same name", () => {
    expect(layersUnder(webDevelopment, all).map((layer) => layer.id)).toEqual(["s", "d"]);
  });

  test("a root stage sits on shared, and shared on nothing", () => {
    expect(layersUnder(rootStaging, all).map((layer) => layer.id)).toEqual(["s"]);
    expect(layersUnder(shared, all)).toEqual([]);
  });

  test("an app that opts out of the root keeps only shared", () => {
    const layers = layersUnder(webDevelopment, all, { inheritRoot: false });
    expect(layers.map((layer) => layer.id)).toEqual(["s"]);
  });
});

describe("merging and separating layers", () => {
  const sharedValues = { LOG_LEVEL: "info", REGION: "eu" };
  const rootValues = { DATABASE_URL: "postgres://dev", REGION: "us" };

  test("a later layer wins", () => {
    expect(mergeLayers([sharedValues, rootValues, { REGION: "ap", PORT: "3001" }])).toEqual({
      LOG_LEVEL: "info",
      DATABASE_URL: "postgres://dev",
      REGION: "ap",
      PORT: "3001",
    });
  });

  test("pushing a pulled file keeps lower keys in their own layers", () => {
    const lower = mergeLayers([sharedValues, rootValues]);
    const local = { ...lower, REGION: "ap", PORT: "3002", NEW: "1" };

    const toPush = separateFromLayers({ local, lower, remoteTop: { REGION: "ap", PORT: "3001" } });

    // LOG_LEVEL and DATABASE_URL came from below unchanged; REGION is the app's own.
    expect(toPush).toEqual({ REGION: "ap", PORT: "3002", NEW: "1" });
  });

  test("a lower key changed in the file becomes an override in the top layer", () => {
    const lower = mergeLayers([sharedValues, rootValues]);
    const toPush = separateFromLayers({
      local: { ...lower, DATABASE_URL: "postgres://mine" },
      lower,
      remoteTop: {},
    });

    expect(toPush).toEqual({ DATABASE_URL: "postgres://mine" });
  });
});

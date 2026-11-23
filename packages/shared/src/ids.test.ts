import { describe, expect, test } from "bun:test";
import { newUuidV7s } from "./ids.ts";

describe("newUuidV7s", () => {
  test("makes distinct version 7 ids that sort in the order asked for", () => {
    const ids = newUuidV7s(4);

    expect(new Set(ids).size).toBe(4);
    expect(ids.toSorted((a, b) => a.localeCompare(b))).toEqual(ids);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  test("starts with the time, so later ids sort after earlier ones", () => {
    const [earlier] = newUuidV7s(1, 1_700_000_000_000);
    const [later] = newUuidV7s(1, 1_700_000_000_001);

    expect(earlier?.startsWith("018bcfe5-6800")).toBe(true);
    expect((later ?? "") > (earlier ?? "")).toBe(true);
  });
});

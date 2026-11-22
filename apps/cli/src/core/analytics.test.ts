import { describe, expect, test } from "bun:test";
import { analyticsAllowed, buildUpgradeEvent, countUpgrade } from "./analytics.ts";

async function unreachable(): Promise<never> {
  throw new Error("offline");
}

const count = { from: "0.1.1", to: "0.1.2", os: "linux", arch: "arm64" };

describe("upgrade counts", () => {
  test("send only the versions, OS, CPU and whether it ran in CI", () => {
    expect(buildUpgradeEvent(count, {}).payload.data).toEqual({
      from: "0.1.1",
      to: "0.1.2",
      os: "linux",
      arch: "arm64",
      ci: false,
    });
    expect(buildUpgradeEvent(count, { CI: "true" }).payload.data.ci).toBe(true);
    expect(Object.keys(buildUpgradeEvent(count, {}).payload).toSorted()).toEqual([
      "data",
      "hostname",
      "name",
      "url",
      "website",
    ]);
  });

  test("DO_NOT_TRACK and ENVY_NO_ANALYTICS turn them off", async () => {
    expect(analyticsAllowed({})).toBe(true);
    expect(analyticsAllowed({ DO_NOT_TRACK: "0" })).toBe(true);
    expect(analyticsAllowed({ DO_NOT_TRACK: "1" })).toBe(false);
    expect(analyticsAllowed({ ENVY_NO_ANALYTICS: "true" })).toBe(false);

    let calls = 0;
    const send = async () => {
      calls += 1;
    };
    await countUpgrade(count, { environment: { DO_NOT_TRACK: "1" }, send });
    expect(calls).toBe(0);
  });

  test("never fails the command when the analytics server is unreachable", async () => {
    await countUpgrade(count, { environment: {}, send: unreachable });
  });

  test("uses a user agent Umami does not drop as a bot", async () => {
    let userAgent = "";
    const send = async (_url: string, init: RequestInit) => {
      userAgent = new Headers(init.headers).get("user-agent") ?? "";
    };
    await countUpgrade(count, { environment: {}, send });
    expect(userAgent).toBe("envy-cli/0.1.2 (linux; arm64)");
  });
});

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { members } from "../../db/schema.ts";
import {
  createProjectAsClient,
  makeProjectBody,
  pullSecretsAsClient,
  pushSecretsAsClient,
  readItems,
  readNumber,
  signUpWithKeys,
  type TestUser,
} from "../../test/crypto-client.ts";
import { readErrorCode, createTestApp, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;
let owner: TestUser;
let project: Awaited<ReturnType<typeof createProjectAsClient>>;

function placeOf(environmentName: string) {
  const environmentId = project.environmentIds[environmentName] ?? "";
  return { projectId: project.projectId, environmentId };
}

beforeAll(async () => {
  testApp = await createTestApp();
  owner = await signUpWithKeys(testApp, "owner");
  project = await createProjectAsClient(testApp, owner, "My App");
});

afterAll(async () => {
  await testApp.close();
});

describe("creating a project", () => {
  test("also creates shared, development, staging and a protected production", () => {
    expect(project.createdStatus).toBe(201);
    expect(project.environments).toEqual([
      expect.objectContaining({
        name: "shared",
        isShared: true,
        isProtected: false,
        latestVersion: 0,
      }),
      expect.objectContaining({ name: "development", isShared: false, isProtected: false }),
      expect.objectContaining({ name: "staging", isShared: false, isProtected: false }),
      expect.objectContaining({ name: "production", isShared: false, isProtected: true }),
    ]);
  });

  test("a second project with the same slug gets 409, and bad keys get 400", async () => {
    const duplicate = await testApp.request("POST", "/v1/projects", {
      accessToken: owner.accessToken,
      body: await makeProjectBody(owner, "my app"),
    });
    expect(duplicate.status).toBe(409);
    expect(readErrorCode(duplicate.body)).toBe("PROJECT_SLUG_TAKEN");

    const badKeys = await testApp.request("POST", "/v1/projects", {
      accessToken: owner.accessToken,
      body: {
        ...(await makeProjectBody(owner, "Other")),
        environmentKeys: { shared: "AQ", development: "AQ", staging: "AQ", production: "AQ" },
      },
    });
    expect(readErrorCode(badKeys.body)).toBe("VALIDATION_FAILED");

    // An old client's anonymous sealed boxes (format 1, 81 bytes) are refused.
    const sealedBox = "A".repeat(108);
    const oldFormat = await testApp.request("POST", "/v1/projects", {
      accessToken: owner.accessToken,
      body: {
        ...(await makeProjectBody(owner, "Old client")),
        environmentKeys: {
          shared: sealedBox,
          development: sealedBox,
          staging: sealedBox,
          production: sealedBox,
        },
      },
    });
    expect(readErrorCode(oldFormat.body)).toBe("VALIDATION_FAILED");
  });
});

describe("pushing and pulling", () => {
  test("a pushed environment comes back decrypted, and each version stays readable", async () => {
    const place = placeOf("development");
    const first = await pushSecretsAsClient(testApp, owner, place, { API_URL: "http://one" }, 0);
    expect(first.status).toBe(201);
    expect(readNumber(first.body, "version")).toBe(1);

    await pushSecretsAsClient(testApp, owner, place, { API_URL: "http://two", NEW: "x" }, 1);

    expect(await pullSecretsAsClient(testApp, owner, place)).toEqual({
      API_URL: "http://two",
      NEW: "x",
    });
    expect(await pullSecretsAsClient(testApp, owner, place, 1)).toEqual({ API_URL: "http://one" });
    const missing = await testApp.request(
      "GET",
      `/v1/environments/${place.environmentId}/secrets?version=9`,
      { accessToken: owner.accessToken },
    );
    expect(readErrorCode(missing.body)).toBe("VERSION_NOT_FOUND");
  });

  test("an empty environment returns null", async () => {
    const response = await testApp.request(
      "GET",
      `/v1/environments/${placeOf("staging").environmentId}/secrets`,
      { accessToken: owner.accessToken },
    );

    expect(response.body).toEqual({ current: null });
  });

  test("a push based on an old version gets 409 with the latest version number", async () => {
    const place = placeOf("shared");
    await pushSecretsAsClient(testApp, owner, place, { A: "1" }, 0);
    await pushSecretsAsClient(testApp, owner, place, { A: "2" }, 1);

    const stale = await pushSecretsAsClient(testApp, owner, place, { A: "stale" }, 1);

    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: { code: "VERSION_CONFLICT", details: { latestVersion: 2 } },
    });
  });

  test("two pushes racing for the same version: one wins, the other gets 409", async () => {
    const place = placeOf("production");

    const results = await Promise.all([
      pushSecretsAsClient(testApp, owner, place, { RACE: "a" }, 0),
      pushSecretsAsClient(testApp, owner, place, { RACE: "b" }, 0),
    ]);

    expect(
      results.map((result) => result.status).toSorted((first, second) => first - second),
    ).toEqual([201, 409]);
  });

  test("history lists versions newest first, page by page, without ciphertext", async () => {
    const place = placeOf("development");
    const firstPage = await testApp.request(
      "GET",
      `/v1/environments/${place.environmentId}/versions?limit=1`,
      { accessToken: owner.accessToken },
    );
    expect(firstPage.body).toMatchObject({
      items: [{ version: 2, author: { githubLogin: "owner" } }],
      nextCursor: "2",
    });
    expect(JSON.stringify(firstPage.body)).not.toContain("ciphertext");

    const secondPage = await testApp.request(
      "GET",
      `/v1/environments/${place.environmentId}/versions?limit=1&cursor=2`,
      { accessToken: owner.accessToken },
    );
    expect(secondPage.body).toMatchObject({ items: [{ version: 1 }], nextCursor: null });
  });
});

describe("plaintext never reaches the API", () => {
  test("no request, response or database row contains a pushed value", async () => {
    const marker = "PLAINTEXT-MARKER-7f3a9c";
    const place = placeOf("staging");
    await pushSecretsAsClient(
      testApp,
      owner,
      place,
      { DATABASE_URL: marker, [marker]: "key name" },
      0,
    );
    expect(await pullSecretsAsClient(testApp, owner, place)).toMatchObject({
      DATABASE_URL: marker,
    });

    expect(testApp.traffic.join("\n")).not.toContain(marker);
    // Every row of every table, as text.
    const dump = await testApp.database.execute(sql`
      select json_build_array(
        (select json_agg(t) from users t),
        (select json_agg(t) from sessions t),
        (select json_agg(t) from projects t),
        (select json_agg(t) from members t),
        (select json_agg(t) from environments t),
        (select json_agg(t) from environment_keys t),
        (select json_agg(t) from secret_versions t),
        (select json_agg(t) from audit_log t)
      ) as everything`);
    const everything = JSON.stringify(dump);
    expect(everything).toContain("secrets.pushed");
    expect(everything).not.toContain(marker);
  });

  test("a push with an extra field (for example plaintext) is refused", async () => {
    const response = await testApp.request(
      "POST",
      `/v1/environments/${placeOf("staging").environmentId}/secrets`,
      {
        accessToken: owner.accessToken,
        body: { baseVersion: 1, keyVersion: 1, ciphertext: "AQ", nonce: "AQ", secrets: { A: "b" } },
      },
    );

    expect(response.status).toBe(400);
    expect(readErrorCode(response.body)).toBe("VALIDATION_FAILED");
  });
});

describe("access", () => {
  test("a non-member gets 404 everywhere, never 403", async () => {
    const stranger = await signUpWithKeys(testApp, "stranger");
    const environmentId = placeOf("development").environmentId;
    const projectPath = `/v1/projects/${project.projectId}`;
    const attempts: Array<[string, string, unknown]> = [
      ["GET", projectPath, undefined],
      ["PATCH", projectPath, { name: "Taken over" }],
      ["DELETE", projectPath, undefined],
      ["GET", `${projectPath}/environments`, undefined],
      [
        "POST",
        `${projectPath}/environments`,
        {
          id: Bun.randomUUIDv7(),
          name: "evil",
          wrappedKeys: [{ userId: stranger.userId, wrappedKey: "AQ" }],
        },
      ],
      ["GET", `${projectPath}/audit`, undefined],
      ["GET", `/v1/environments/${environmentId}/key`, undefined],
      ["GET", `/v1/environments/${environmentId}/secrets`, undefined],
      ["GET", `/v1/environments/${environmentId}/versions`, undefined],
      [
        "POST",
        `/v1/environments/${environmentId}/secrets`,
        { baseVersion: 2, keyVersion: 1, ciphertext: "AQ", nonce: "AQ" },
      ],
    ];

    for (const [method, path, body] of attempts) {
      const response = await testApp.request(method, path, {
        accessToken: stranger.accessToken,
        body,
      });
      expect({ method, path, status: response.status }).toEqual({ method, path, status: 404 });
    }
    const list = await testApp.request("GET", "/v1/projects", {
      accessToken: stranger.accessToken,
    });
    expect(list.body).toEqual({ items: [], nextCursor: null });
  });

  test("a viewer can pull but not push; only admins see the audit log", async () => {
    const viewer = await signUpWithKeys(testApp, "viewer");
    await testApp.database.insert(members).values({
      projectId: project.projectId,
      userId: viewer.userId,
      role: "viewer",
      status: "active",
    });
    const environmentId = placeOf("development").environmentId;

    const pull = await testApp.request("GET", `/v1/environments/${environmentId}/secrets`, {
      accessToken: viewer.accessToken,
    });
    expect(pull.status).toBe(200);
    const push = await testApp.request("POST", `/v1/environments/${environmentId}/secrets`, {
      accessToken: viewer.accessToken,
      body: { baseVersion: 2, keyVersion: 1, ciphertext: "AQ", nonce: "AQ" },
    });
    expect(push.status).toBe(403);
    expect(readErrorCode(push.body)).toBe("FORBIDDEN");
    const audit = await testApp.request("GET", `/v1/projects/${project.projectId}/audit`, {
      accessToken: viewer.accessToken,
    });
    expect(audit.status).toBe(403);

    // The owner sees who did what by name, not just by id.
    const asOwner = await testApp.request("GET", `/v1/projects/${project.projectId}/audit`, {
      accessToken: owner.accessToken,
    });
    expect(readItems(asOwner.body)).toContainEqual(
      expect.objectContaining({ action: "secrets.read", actorName: "@viewer" }),
    );
  });

  test("new environments must carry a key for every active member", async () => {
    const path = `/v1/projects/${project.projectId}/environments`;
    const onlyOwner = await testApp.request("POST", path, {
      accessToken: owner.accessToken,
      body: {
        id: Bun.randomUUIDv7(),
        name: "preview",
        wrappedKeys: [{ userId: owner.userId, wrappedKey: "A".repeat(98) }],
      },
    });

    // The viewer added above is an active member too, so they are missing.
    expect(onlyOwner.status).toBe(400);
    expect(readErrorCode(onlyOwner.body)).toBe("RECIPIENTS_MISMATCH");
  });
});

describe("audit log", () => {
  test("records project creation and every secret read and write", async () => {
    const response = await testApp.request(
      "GET",
      `/v1/projects/${project.projectId}/audit?limit=100`,
      { accessToken: owner.accessToken, headers: { "user-agent": "envy-cli/test" } },
    );
    const actions = readItems(response.body).map((item) => JSON.stringify(item));

    expect(actions.some((item) => item.includes('"project.created"'))).toBe(true);
    expect(
      actions.some((item) => item.includes('"secrets.pushed"') && item.includes('"version":2')),
    ).toBe(true);
    expect(actions.some((item) => item.includes('"secrets.read"'))).toBe(true);
  });
});

describe("deleting a project", () => {
  test("only the owner can, and afterwards it is gone for everyone", async () => {
    const doomed = await createProjectAsClient(testApp, owner, "Doomed");
    const path = `/v1/projects/${doomed.projectId}`;

    const deleted = await testApp.request("DELETE", path, { accessToken: owner.accessToken });
    expect(deleted.status).toBe(200);

    const afterwards = await testApp.request("GET", path, { accessToken: owner.accessToken });
    expect(afterwards.status).toBe(404);
    const environmentId = doomed.environmentIds["development"] ?? "";
    const secrets = await testApp.request("GET", `/v1/environments/${environmentId}/secrets`, {
      accessToken: owner.accessToken,
    });
    expect(secrets.status).toBe(404);
  });
});

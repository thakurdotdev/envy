import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createAppAsClient, makeStageEnvironments } from "../../test/apps-client.ts";
import {
  createProjectAsClient,
  fetchEnvKey,
  grantAsClient,
  listEnvironmentInfo,
  listMembers,
  pullSecretsAsClient,
  pushSecretsAsClient,
  readItems,
  removeAsClient,
  rotateAsClient,
  signUpWithKeys,
  wrapAsClient,
  type EnvironmentInfo,
  type TestUser,
} from "../../test/crypto-client.ts";
import { fromBase64Url } from "@envy/crypto";
import { memberCanRead } from "@envy/shared";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;
let owner: TestUser;
let contractor: TestUser;
let contractorMemberId: string;
let project: Awaited<ReturnType<typeof createProjectAsClient>>;

async function environments(): Promise<EnvironmentInfo[]> {
  return listEnvironmentInfo(testApp, owner, project.projectId);
}

async function contractorMember() {
  const member = (await listMembers(testApp, owner, project.projectId)).find(
    (candidate) => candidate.githubLogin === "contractor",
  );
  if (member === undefined) {
    throw new Error("The contractor is missing.");
  }
  return member;
}

function readSecrets(user: TestUser, environmentId: string) {
  return testApp.request("GET", `/v1/environments/${environmentId}/secrets`, {
    accessToken: user.accessToken,
  });
}

beforeAll(async () => {
  testApp = await createTestApp();
  owner = await signUpWithKeys(testApp, "owner");
  contractor = await signUpWithKeys(testApp, "contractor");
  project = await createProjectAsClient(testApp, owner, "Restricted");
  expect((await createAppAsClient(testApp, owner, project.projectId, "web")).status).toBe(201);
  for (const environment of await environments()) {
    const place = { projectId: project.projectId, environmentId: environment.id };
    await pushSecretsAsClient(testApp, owner, place, { NAME: environment.name }, 0);
  }
  const invited = await testApp.request("POST", `/v1/projects/${project.projectId}/members`, {
    accessToken: owner.accessToken,
    body: { email: "contractor@example.invalid", role: "member" },
  });
  await testApp.request("POST", `/v1/invites/${readField(invited.body, "token")}/accept`, {
    accessToken: contractor.accessToken,
  });
  const member = await contractorMember();
  contractorMemberId = member.id;
  const granted = await grantAsClient(testApp, owner, project.projectId, member, ["development"]);
  expect(granted.status).toBe(200);
});

afterAll(async () => {
  await testApp.close();
});

describe("a member with access to development only", () => {
  test("sees shared and development (root and app) and nothing else", async () => {
    const listed = await testApp.request(
      "GET",
      `/v1/projects/${project.projectId}/environments?apps=true`,
      { accessToken: contractor.accessToken },
    );
    const names = readItems(listed.body).map((item) => readField(item, "name"));
    expect(names.toSorted()).toEqual(["development", "development", "shared"]);
    const development = project.environmentIds["development"] ?? "";
    expect(
      await pullSecretsAsClient(testApp, contractor, {
        projectId: project.projectId,
        environmentId: development,
      }),
    ).toEqual({ NAME: "development" });
  });

  test("is refused production by the server, with no key to open it either", async () => {
    const production = project.environmentIds["production"] ?? "";
    const secrets = await readSecrets(contractor, production);
    expect(secrets.status).toBe(403);
    expect(readErrorCode(secrets.body)).toBe("NO_ENVIRONMENT_ACCESS");
    const key = await testApp.request("GET", `/v1/environments/${production}/key`, {
      accessToken: contractor.accessToken,
    });
    expect(readErrorCode(key.body)).toBe("NO_ENVIRONMENT_ACCESS");
  });

  test("gets no key for a new stage, and cannot be made an admin", async () => {
    const [root] = await makeStageEnvironments(testApp, owner, project.projectId, ["preview"]);
    const apps = await testApp.request("GET", `/v1/projects/${project.projectId}/apps`, {
      accessToken: owner.accessToken,
    });
    const webId = readField(readItems(apps.body)[0], "id");
    const [forWeb] = await makeStageEnvironments(testApp, owner, project.projectId, ["preview"]);
    if (root === undefined || forWeb === undefined) {
      throw new Error("No environments were made.");
    }
    expect(root.wrappedKeys).toHaveLength(1);
    const created = await testApp.request(
      "POST",
      `/v1/projects/${project.projectId}/environments`,
      {
        accessToken: owner.accessToken,
        body: {
          id: root.id,
          name: "preview",
          wrappedKeys: root.wrappedKeys,
          appEnvironments: [{ appId: webId, id: forWeb.id, wrappedKeys: forWeb.wrappedKeys }],
        },
      },
    );
    expect(created.status).toBe(201);

    const promoted = await testApp.request("PATCH", `/v1/members/${contractorMemberId}`, {
      accessToken: owner.accessToken,
      body: { role: "admin" },
    });
    expect(promoted.status).toBe(400);
  });
});

describe("changing access", () => {
  test("adding staging sends its keys; taking it away rotates it for everyone else", async () => {
    const member = await contractorMember();
    const stagingEnvironments = (await environments()).filter(
      (environment) => environment.name === "staging",
    );
    const wrappedKeys = [];
    for (const environment of stagingEnvironments) {
      const envKey = await fetchEnvKey(testApp, owner, environment.id);
      wrappedKeys.push({
        environmentId: environment.id,
        keyVersion: environment.currentKeyVersion,
        wrappedKey: await wrapAsClient(envKey, owner, await fromBase64Url(member.publicKey), {
          environmentId: environment.id,
          keyVersion: environment.currentKeyVersion,
        }),
      });
    }
    const path = `/v1/members/${contractorMemberId}/access`;
    const missingKeys = await testApp.request("PUT", path, {
      accessToken: owner.accessToken,
      body: { access: ["development", "staging"], wrappedKeys: [], rotations: [] },
    });
    expect(readErrorCode(missingKeys.body)).toBe("RECIPIENTS_MISMATCH");
    const widened = await testApp.request("PUT", path, {
      accessToken: owner.accessToken,
      body: { access: ["development", "staging"], wrappedKeys, rotations: [] },
    });
    expect(widened.status).toBe(200);
    const staging = project.environmentIds["staging"] ?? "";
    expect((await readSecrets(contractor, staging)).status).toBe(200);

    const everyone = await listMembers(testApp, owner, project.projectId);
    const rotations = [];
    for (const environment of await environments()) {
      if (environment.name === "staging") {
        const keepers = everyone.filter(
          (candidate) =>
            candidate.id !== contractorMemberId && memberCanRead(candidate, environment),
        );
        rotations.push(
          await rotateAsClient(testApp, owner, project.projectId, environment, keepers),
        );
      }
    }
    const narrowed = await testApp.request("PUT", path, {
      accessToken: owner.accessToken,
      body: { access: ["development"], wrappedKeys: [], rotations },
    });
    expect(narrowed.status).toBe(200);
    expect((await readSecrets(contractor, staging)).status).toBe(403);
    // The owner still reads staging, under the new key.
    expect(
      await pullSecretsAsClient(testApp, owner, {
        projectId: project.projectId,
        environmentId: staging,
      }),
    ).toEqual({ NAME: "staging" });
  });

  test("an unknown stage, or a restricted admin, is refused", async () => {
    const unknown = await testApp.request("PUT", `/v1/members/${contractorMemberId}/access`, {
      accessToken: owner.accessToken,
      body: { access: ["moon"], wrappedKeys: [], rotations: [] },
    });
    expect(unknown.status).toBe(400);
  });
});

describe("removing a restricted member", () => {
  test("rotates only the environments they could read", async () => {
    const removed = await removeAsClient(testApp, owner, project.projectId, contractorMemberId);
    expect(removed.status).toBe(200);
    const production = (await environments()).find(
      (environment) => environment.appId === null && environment.name === "production",
    );
    expect(production?.currentKeyVersion).toBe(1);
  });
});

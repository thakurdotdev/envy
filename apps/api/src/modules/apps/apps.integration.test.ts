import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createAppAsClient, makeStageEnvironments } from "../../test/apps-client.ts";
import {
  createProjectAsClient,
  createTokenAsClient,
  encryptPushAsClient,
  grantAsClient,
  listEnvironmentInfo,
  listMembers,
  pullSecretsAsClient,
  pushSecretsAsClient,
  readItems,
  removeAsClient,
  signUpWithKeys,
  type TestUser,
} from "../../test/crypto-client.ts";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;
let owner: TestUser;
let project: Awaited<ReturnType<typeof createProjectAsClient>>;
let webAppId: string;
/** Environment id by "<app>/<name>", with "root" for the project's own. */
const environmentIds = new Map<string, string>();

function placeOf(app: string, name: string) {
  return {
    projectId: project.projectId,
    environmentId: environmentIds.get(`${app}/${name}`) ?? "",
  };
}

async function refreshEnvironmentIds(): Promise<void> {
  const apps = await testApp.request("GET", `/v1/projects/${project.projectId}/apps`, {
    accessToken: owner.accessToken,
  });
  const appNames = new Map(
    readItems(apps.body).map((item) => [readField(item, "id"), readField(item, "name")]),
  );
  environmentIds.clear();
  for (const environment of await listEnvironmentInfo(testApp, owner, project.projectId)) {
    const app = environment.appId === null ? "root" : (appNames.get(environment.appId) ?? "?");
    environmentIds.set(`${app}/${environment.name}`, environment.id);
  }
}

async function addMember(login: string): Promise<TestUser> {
  const user = await signUpWithKeys(testApp, login);
  const invited = await testApp.request("POST", `/v1/projects/${project.projectId}/members`, {
    accessToken: owner.accessToken,
    body: { email: `${login}@example.invalid`, role: "member" },
  });
  await testApp.request("POST", `/v1/invites/${readField(invited.body, "token")}/accept`, {
    accessToken: user.accessToken,
  });
  const member = (await listMembers(testApp, owner, project.projectId)).find(
    (candidate) => candidate.githubLogin === login,
  );
  if (member === undefined) {
    throw new Error("The member is missing from the list.");
  }
  const granted = await grantAsClient(testApp, owner, project.projectId, member);
  expect(granted.status).toBe(200);
  return user;
}

beforeAll(async () => {
  testApp = await createTestApp();
  owner = await signUpWithKeys(testApp, "owner");
  project = await createProjectAsClient(testApp, owner, "Monorepo");
  const created = await createAppAsClient(testApp, owner, project.projectId, "web");
  expect(created.status).toBe(201);
  webAppId = readField(created.body, "id");
  await refreshEnvironmentIds();
});

afterAll(async () => {
  await testApp.close();
});

describe("creating an app", () => {
  test("gives it one environment per root stage, with production still protected", async () => {
    const all = await testApp.request(
      "GET",
      `/v1/projects/${project.projectId}/environments?apps=true`,
      { accessToken: owner.accessToken },
    );
    const webEnvironments = readItems(all.body).filter(
      (item) =>
        typeof item === "object" && item !== null && "appId" in item && item.appId === webAppId,
    );
    expect(webEnvironments).toEqual([
      expect.objectContaining({ name: "development", isShared: false, isProtected: false }),
      expect.objectContaining({ name: "staging", isProtected: false }),
      expect.objectContaining({ name: "production", isProtected: true }),
    ]);
  });

  test("older clients, which leave out ?apps=true, see only the root environments", async () => {
    const rootOnly = await testApp.request(
      "GET",
      `/v1/projects/${project.projectId}/environments`,
      { accessToken: owner.accessToken },
    );
    expect(readItems(rootOnly.body).map((item) => readField(item, "name"))).toEqual([
      "shared",
      "development",
      "staging",
      "production",
    ]);
  });

  test("needs exactly the root stages, a free name, and not the reserved name root", async () => {
    const missingStage = await createAppAsClient(testApp, owner, project.projectId, "api", [
      "development",
      "staging",
    ]);
    expect(readErrorCode(missingStage.body)).toBe("APP_ENVIRONMENTS_MISMATCH");
    const withShared = await createAppAsClient(testApp, owner, project.projectId, "api", [
      "shared",
      "development",
      "staging",
      "production",
    ]);
    expect(readErrorCode(withShared.body)).toBe("APP_ENVIRONMENTS_MISMATCH");
    const taken = await createAppAsClient(testApp, owner, project.projectId, "web");
    expect(taken.status).toBe(409);
    expect(readErrorCode(taken.body)).toBe("APP_NAME_TAKEN");
    const reserved = await createAppAsClient(testApp, owner, project.projectId, "root");
    expect(readErrorCode(reserved.body)).toBe("APP_NAME_TAKEN");
  });
});

describe("adding a stage", () => {
  test("must add it to every app in the same request", async () => {
    const [root] = await makeStageEnvironments(testApp, owner, project.projectId, ["preview"]);
    const [forWeb] = await makeStageEnvironments(testApp, owner, project.projectId, ["preview"]);
    if (root === undefined || forWeb === undefined) {
      throw new Error("No environments were made.");
    }
    const path = `/v1/projects/${project.projectId}/environments`;
    const rootOnly = await testApp.request("POST", path, {
      accessToken: owner.accessToken,
      body: { id: root.id, name: "preview", wrappedKeys: root.wrappedKeys },
    });
    expect(readErrorCode(rootOnly.body)).toBe("APP_ENVIRONMENTS_MISMATCH");

    const everywhere = await testApp.request("POST", path, {
      accessToken: owner.accessToken,
      body: {
        id: root.id,
        name: "preview",
        wrappedKeys: root.wrappedKeys,
        appEnvironments: [{ appId: webAppId, id: forWeb.id, wrappedKeys: forWeb.wrappedKeys }],
      },
    });
    expect(everywhere.status).toBe(201);
    await refreshEnvironmentIds();
    expect(environmentIds.has("web/preview")).toBe(true);
  });
});

describe("pushing several environments at once", () => {
  test("saves all of them, or none when one has an old base version", async () => {
    const path = `/v1/projects/${project.projectId}/secrets`;
    const rootStaging = placeOf("root", "staging");
    const webStaging = placeOf("web", "staging");
    const both = await testApp.request("POST", path, {
      accessToken: owner.accessToken,
      body: {
        pushes: [
          {
            environmentId: rootStaging.environmentId,
            ...(await encryptPushAsClient(testApp, owner, rootStaging, { REGION: "eu" }, 0)),
          },
          {
            environmentId: webStaging.environmentId,
            ...(await encryptPushAsClient(testApp, owner, webStaging, { PORT: "3001" }, 0)),
          },
        ],
      },
    });
    expect(both.status).toBe(201);
    expect(await pullSecretsAsClient(testApp, owner, webStaging)).toEqual({ PORT: "3001" });

    // The root push is current, the web one is stale: neither may be saved.
    const stale = await testApp.request("POST", path, {
      accessToken: owner.accessToken,
      body: {
        pushes: [
          {
            environmentId: rootStaging.environmentId,
            ...(await encryptPushAsClient(testApp, owner, rootStaging, { REGION: "us" }, 1)),
          },
          {
            environmentId: webStaging.environmentId,
            ...(await encryptPushAsClient(testApp, owner, webStaging, { PORT: "4000" }, 0)),
          },
        ],
      },
    });
    expect(stale.status).toBe(409);
    expect(readErrorCode(stale.body)).toBe("VERSION_CONFLICT");
    expect(JSON.stringify(stale.body)).toContain(webStaging.environmentId);
    expect(await pullSecretsAsClient(testApp, owner, rootStaging)).toEqual({ REGION: "eu" });
  });

  test("refuses an environment from another project", async () => {
    const other = await createProjectAsClient(testApp, owner, "Other");
    const place = {
      projectId: other.projectId,
      environmentId: other.environmentIds["development"] ?? "",
    };
    const response = await testApp.request("POST", `/v1/projects/${project.projectId}/secrets`, {
      accessToken: owner.accessToken,
      body: {
        pushes: [
          {
            environmentId: place.environmentId,
            ...(await encryptPushAsClient(testApp, owner, place, { A: "1" }, 0)),
          },
        ],
      },
    });
    expect(readErrorCode(response.body)).toBe("ENVIRONMENT_NOT_FOUND");
  });
});

describe("service tokens for an app", () => {
  test("read their environment and the layers under it, and nothing else", async () => {
    await pushSecretsAsClient(testApp, owner, placeOf("root", "shared"), { ORG: "acme" }, 0);
    const webDevelopment = placeOf("web", "development");
    const layers = [placeOf("root", "shared"), placeOf("root", "development")].map(
      (place) => place.environmentId,
    );
    const token = await createTokenAsClient(testApp, owner, webDevelopment, "ci", layers);
    expect(token.status).toBe(201);

    const current = await testApp.request("GET", "/v1/tokens/current", {
      headers: { authorization: token.bearer },
    });
    expect(current.body).toMatchObject({
      layers: [
        { name: "shared", appId: null },
        { name: "development", appId: null },
      ],
    });
    for (const environmentId of layers) {
      const read = await testApp.request("GET", `/v1/environments/${environmentId}/secrets`, {
        headers: { authorization: token.bearer },
      });
      expect(read.status).toBe(200);
    }
    const otherStage = await testApp.request(
      "GET",
      `/v1/environments/${placeOf("root", "staging").environmentId}/secrets`,
      { headers: { authorization: token.bearer } },
    );
    expect(otherStage.status).toBe(404);
  });

  test("cannot be given keys for anything but the real layers", async () => {
    const wrongLayers = [placeOf("root", "shared"), placeOf("root", "staging")].map(
      (place) => place.environmentId,
    );
    const token = await createTokenAsClient(
      testApp,
      owner,
      placeOf("web", "development"),
      "sneaky",
      wrongLayers,
    );
    expect(token.status).toBe(400);
  });
});

describe("members and apps", () => {
  test("a grant and a removal cover the app environments too", async () => {
    const teammate = await addMember("teammate");
    const webDevelopment = placeOf("web", "development");
    await pushSecretsAsClient(testApp, owner, webDevelopment, { API_URL: "http://api" }, 0);
    expect(await pullSecretsAsClient(testApp, teammate, webDevelopment)).toEqual({
      API_URL: "http://api",
    });

    const member = (await listMembers(testApp, owner, project.projectId)).find(
      (candidate) => candidate.githubLogin === "teammate",
    );
    // A rotation of the shared layer must re-wrap for the app token that reads it.
    const missingTokenKey = await removeAsClient(
      testApp,
      owner,
      project.projectId,
      member?.id ?? "",
    );
    expect(readErrorCode(missingTokenKey.body)).toBe("RECIPIENTS_MISMATCH");
  });
});

describe("removing an app", () => {
  test("stops serving its environments, revokes its tokens and frees its name", async () => {
    const api = await createAppAsClient(testApp, owner, project.projectId, "api", [
      "development",
      "staging",
      "production",
      "preview",
    ]);
    const apiAppId = readField(api.body, "id");
    await refreshEnvironmentIds();
    const apiDevelopment = placeOf("api", "development");
    const token = await createTokenAsClient(testApp, owner, apiDevelopment, "api-ci", [
      placeOf("root", "shared").environmentId,
      placeOf("root", "development").environmentId,
    ]);

    const removed = await testApp.request("DELETE", `/v1/apps/${apiAppId}`, {
      accessToken: owner.accessToken,
    });
    expect(removed.status).toBe(204);
    const read = await testApp.request(
      "GET",
      `/v1/environments/${apiDevelopment.environmentId}/secrets`,
      { accessToken: owner.accessToken },
    );
    expect(read.status).toBe(404);
    const tokenRead = await testApp.request("GET", "/v1/tokens/current", {
      headers: { authorization: token.bearer },
    });
    expect(tokenRead.status).toBe(401);
    const again = await createAppAsClient(testApp, owner, project.projectId, "api", [
      "development",
      "staging",
      "production",
      "preview",
    ]);
    expect(again.status).toBe(201);
  });
});

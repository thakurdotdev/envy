import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { environments, projects } from "../../db/schema.ts";
import { createRunInTransaction } from "../../repositories.ts";
import {
  createProjectAsClient,
  createTokenAsClient,
  pushSecretsAsClient,
  readItems,
  signUpWithKeys,
  type TestUser,
} from "../../test/crypto-client.ts";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";
import { purgeDeletedProjects } from "./purge.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

let testApp: TestApp;
let owner: TestUser;
let stranger: TestUser;

beforeAll(async () => {
  testApp = await createTestApp();
  owner = await signUpWithKeys(testApp, "owner");
  stranger = await signUpWithKeys(testApp, "stranger");
});

afterAll(async () => {
  await testApp.close();
});

async function makeProjectWithSecrets(name: string) {
  const project = await createProjectAsClient(testApp, owner, name);
  const place = {
    projectId: project.projectId,
    environmentId: project.environmentIds["development"] ?? "",
  };
  await pushSecretsAsClient(testApp, owner, place, { A: "1" }, 0);
  const token = await createTokenAsClient(testApp, owner, place, "ci");
  return { ...project, place, token };
}

const NOW = new Date("2026-11-22T12:00:00.000Z");

function purge() {
  return purgeDeletedProjects({
    runInTransaction: createRunInTransaction(testApp.database),
    clock: { now: () => NOW },
  });
}

/** Moves a deletion into the past, instead of moving the clock (which would end the sessions). */
async function deletedDaysAgo(projectId: string, days: number): Promise<void> {
  await testApp.database
    .update(projects)
    .set({ deletedAt: new Date(NOW.getTime() - days * DAY_MS) })
    .where(eq(projects.id, projectId));
}

describe("deleting a project", () => {
  test("only the owner can; it disappears at once and its tokens stop working", async () => {
    const project = await makeProjectWithSecrets("Doomed");
    const byStranger = await testApp.request("DELETE", `/v1/projects/${project.projectId}`, {
      accessToken: stranger.accessToken,
    });
    expect(readErrorCode(byStranger.body)).toBe("PROJECT_NOT_FOUND");

    const deleted = await testApp.request("DELETE", `/v1/projects/${project.projectId}`, {
      accessToken: owner.accessToken,
    });
    expect(deleted.status).toBe(200);
    expect(readField(deleted.body, "purgeAfter")).toBe("2026-12-22T12:00:00.000Z");
    const read = await testApp.request(
      "GET",
      `/v1/environments/${project.place.environmentId}/secrets`,
      { accessToken: owner.accessToken },
    );
    expect(read.status).toBe(404);
    const tokenRead = await testApp.request("GET", "/v1/tokens/current", {
      headers: { authorization: project.token.bearer },
    });
    expect(tokenRead.status).toBe(401);
  });

  test("the owner sees it in the deleted list and can restore it within 30 days", async () => {
    const project = await makeProjectWithSecrets("Oops");
    await testApp.request("DELETE", `/v1/projects/${project.projectId}`, {
      accessToken: owner.accessToken,
    });
    await deletedDaysAgo(project.projectId, 10);
    const listed = await testApp.request("GET", "/v1/projects/deleted", {
      accessToken: owner.accessToken,
    });
    expect(readItems(listed.body).map((item) => readField(item, "name"))).toContain("Oops");
    const strangerList = await testApp.request("GET", "/v1/projects/deleted", {
      accessToken: stranger.accessToken,
    });
    expect(readItems(strangerList.body)).toEqual([]);
    const byStranger = await testApp.request("POST", `/v1/projects/${project.projectId}/restore`, {
      accessToken: stranger.accessToken,
    });
    expect(byStranger.status).toBe(404);

    const restored = await testApp.request("POST", `/v1/projects/${project.projectId}/restore`, {
      accessToken: owner.accessToken,
    });
    expect(restored.status).toBe(200);
    const read = await testApp.request(
      "GET",
      `/v1/environments/${project.place.environmentId}/secrets`,
      { accessToken: owner.accessToken },
    );
    expect(read.status).toBe(200);
  });

  test("after 30 days it cannot be restored, and the purge removes every row", async () => {
    const project = await makeProjectWithSecrets("Gone");
    await testApp.request("DELETE", `/v1/projects/${project.projectId}`, {
      accessToken: owner.accessToken,
    });
    const kept = await makeProjectWithSecrets("Kept");
    await deletedDaysAgo(project.projectId, 31);
    const late = await testApp.request("POST", `/v1/projects/${project.projectId}/restore`, {
      accessToken: owner.accessToken,
    });
    expect(late.status).toBe(404);

    expect(await purge()).toBeGreaterThanOrEqual(1);
    const left = await testApp.database
      .select({ id: environments.id })
      .from(environments)
      .where(eq(environments.projectId, project.projectId));
    expect(left).toEqual([]);
    const stillThere = await testApp.request(
      "GET",
      `/v1/environments/${kept.place.environmentId}/secrets`,
      { accessToken: owner.accessToken },
    );
    expect(stillThere.status).toBe(200);
  });
});

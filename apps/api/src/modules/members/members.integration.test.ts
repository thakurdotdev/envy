import { decryptSecrets, fromBase64Url, isCryptoError, unwrapEnvKey } from "@envy/crypto";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { desc, eq } from "drizzle-orm";
import { secretVersions } from "../../db/schema.ts";
import { pathForLogs } from "../../lib/http.ts";
import {
  createProjectAsClient,
  fetchEnvKey,
  grantAsClient,
  listMembers,
  pullSecretsAsClient,
  pushSecretsAsClient,
  removeAsClient,
  signUpWithKeys,
  type TestUser,
} from "../../test/crypto-client.ts";
import { createTestApp, readErrorCode, readField, type TestApp } from "../../test/test-app.ts";

let testApp: TestApp;
let owner: TestUser;
let project: Awaited<ReturnType<typeof createProjectAsClient>>;

function placeOf(environmentName: string) {
  return {
    projectId: project.projectId,
    environmentId: project.environmentIds[environmentName] ?? "",
  };
}

async function invite(email: string, role: string): Promise<string> {
  const response = await testApp.request("POST", `/v1/projects/${project.projectId}/members`, {
    accessToken: owner.accessToken,
    body: { email, role },
  });
  expect(response.status).toBe(201);
  return readField(response.body, "token");
}

/** Invite, accept and grant: a full new active member. */
async function addMember(login: string, role: string): Promise<TestUser & { memberId: string }> {
  const user = await signUpWithKeys(testApp, login);
  const token = await invite(`${login}@example.invalid`, role);
  const accepted = await testApp.request("POST", `/v1/invites/${token}/accept`, {
    accessToken: user.accessToken,
  });
  expect(accepted.status).toBe(200);
  const member = (await listMembers(testApp, owner, project.projectId)).find(
    (candidate) => candidate.githubLogin === login,
  );
  if (member === undefined) {
    throw new Error("The member is missing from the list.");
  }
  const granted = await grantAsClient(testApp, owner, project.projectId, member);
  expect(granted.status).toBe(200);
  return { ...user, memberId: member.id };
}

beforeAll(async () => {
  testApp = await createTestApp();
  owner = await signUpWithKeys(testApp, "owner");
  project = await createProjectAsClient(testApp, owner, "Team App");
  await pushSecretsAsClient(
    testApp,
    owner,
    placeOf("development"),
    { DATABASE_URL: "postgres://one" },
    0,
  );
});

afterAll(async () => {
  await testApp.close();
});

describe("joining a project", () => {
  test("invite, accept and grant: pending members get nothing until an admin grants keys", async () => {
    const newcomer = await signUpWithKeys(testApp, "newcomer");
    const token = await invite("Newcomer@Example.invalid", "member");

    const accepted = await testApp.request("POST", `/v1/invites/${token}/accept`, {
      accessToken: newcomer.accessToken,
    });
    expect(accepted.body).toMatchObject({
      projectName: "Team App",
      role: "member",
      status: "pending",
    });

    const projects = await testApp.request("GET", "/v1/projects", {
      accessToken: owner.accessToken,
    });
    expect(projects.body).toMatchObject({ items: [{ pendingMembers: 1 }] });
    const beforeGrant = await testApp.request(
      "GET",
      `/v1/environments/${placeOf("development").environmentId}/secrets`,
      { accessToken: newcomer.accessToken },
    );
    expect(beforeGrant.status).toBe(404);

    const pending = (await listMembers(testApp, owner, project.projectId)).find(
      (member) => member.githubLogin === "newcomer",
    );
    expect(pending).toMatchObject({ status: "pending", role: "member" });
    if (pending === undefined) {
      return;
    }
    const granted = await grantAsClient(testApp, owner, project.projectId, pending);
    expect(granted.body).toMatchObject({ status: "active" });

    expect(await pullSecretsAsClient(testApp, newcomer, placeOf("development"))).toEqual({
      DATABASE_URL: "postgres://one",
    });
    const grantAgain = await grantAsClient(testApp, owner, project.projectId, pending);
    expect(readErrorCode(grantAgain.body)).toBe("MEMBER_NOT_PENDING");
  });

  test("an invite works once, and only for its email", async () => {
    const intended = await signUpWithKeys(testApp, "intended");
    const someoneElse = await signUpWithKeys(testApp, "someone-else");
    const token = await invite("intended@example.invalid", "member");

    const wrongPerson = await testApp.request("POST", `/v1/invites/${token}/accept`, {
      accessToken: someoneElse.accessToken,
    });
    expect(readErrorCode(wrongPerson.body)).toBe("INVITE_EMAIL_MISMATCH");

    await testApp.request("POST", `/v1/invites/${token}/accept`, {
      accessToken: intended.accessToken,
    });
    const reused = await testApp.request("POST", `/v1/invites/${token}/accept`, {
      accessToken: intended.accessToken,
    });
    expect(readErrorCode(reused.body)).toBe("INVITE_NOT_FOUND");
  });

  test("invite tokens never appear in log lines", () => {
    expect(pathForLogs("http://api.test/v1/invites/secret-invite-token/accept")).toBe(
      "/v1/invites/[redacted]/accept",
    );
  });
});

describe("roles", () => {
  test("a viewer can pull but cannot push; the owner's role cannot be changed", async () => {
    const viewer = await addMember("viewer", "viewer");

    expect(await pullSecretsAsClient(testApp, viewer, placeOf("development"))).toMatchObject({
      DATABASE_URL: "postgres://one",
    });
    const push = await pushSecretsAsClient(testApp, viewer, placeOf("development"), { A: "b" }, 1);
    expect(readErrorCode(push.body)).toBe("FORBIDDEN");

    const promoted = await testApp.request("PATCH", `/v1/members/${viewer.memberId}`, {
      accessToken: owner.accessToken,
      body: { role: "member" },
    });
    expect(promoted.body).toMatchObject({ role: "member" });

    const ownerMember = (await listMembers(testApp, owner, project.projectId)).find(
      (member) => member.role === "owner",
    );
    const demoteOwner = await testApp.request("PATCH", `/v1/members/${ownerMember?.id ?? ""}`, {
      accessToken: owner.accessToken,
      body: { role: "viewer" },
    });
    expect(readErrorCode(demoteOwner.body)).toBe("OWNER_CANNOT_CHANGE");
  });
});

describe("removing a member", () => {
  test("rotates every key: the removed member cannot read newer versions, everyone else still can", async () => {
    const leaving = await addMember("leaving", "member");
    const staying = await addMember("staying", "member");
    const development = placeOf("development");
    // The leaving member keeps a copy of the current key, as a malicious one would.
    const keptKey = await fetchEnvKey(testApp, leaving, development.environmentId);

    const withoutRotation = await testApp.request("DELETE", `/v1/members/${leaving.memberId}`, {
      accessToken: owner.accessToken,
    });
    expect(readErrorCode(withoutRotation.body)).toBe("ROTATION_MISMATCH");

    const removed = await removeAsClient(testApp, owner, project.projectId, leaving.memberId);
    expect(removed.status).toBe(204);
    const versions = await testApp.database
      .select()
      .from(secretVersions)
      .where(eq(secretVersions.environmentId, development.environmentId))
      .orderBy(desc(secretVersions.version));
    const latest = versions[0];
    const pushed = await pushSecretsAsClient(
      testApp,
      owner,
      development,
      { DATABASE_URL: "postgres://rotated" },
      latest?.version ?? 0,
    );
    expect(pushed.status).toBe(201);

    // Through the API: the removed member sees nothing at all.
    const viaApi = await testApp.request(
      "GET",
      `/v1/environments/${development.environmentId}/secrets`,
      {
        accessToken: leaving.accessToken,
      },
    );
    expect(viaApi.status).toBe(404);

    // Even with the ciphertext (a leaked database) and the old key, every version
    // written after the removal fails to decrypt.
    const afterRemoval = await testApp.database
      .select()
      .from(secretVersions)
      .where(eq(secretVersions.environmentId, development.environmentId))
      .orderBy(desc(secretVersions.version));
    const newerVersions = afterRemoval.filter((row) => row.keyVersion > 1);
    expect(newerVersions.length).toBeGreaterThanOrEqual(2);
    for (const row of newerVersions) {
      const attempt = await decryptSecrets(
        { ciphertext: await fromBase64Url(row.ciphertext), nonce: await fromBase64Url(row.nonce) },
        keptKey,
        { ...development, version: row.version, keyVersion: row.keyVersion },
      ).catch((error: unknown) => error);
      expect(isCryptoError(attempt) && attempt.code === "DECRYPTION_FAILED").toBe(true);
    }
    // The leaving member also has no wrapped copy of the new key.
    const keyResponse = await testApp.request(
      "GET",
      `/v1/environments/${development.environmentId}/key?keyVersion=2`,
      { accessToken: staying.accessToken },
    );
    const stayingKey = await unwrapEnvKey(
      await fromBase64Url(readField(keyResponse.body, "wrappedKey")),
      staying.keys.privateKey,
    );
    expect(stayingKey).not.toEqual(keptKey);

    // Everyone who stays can still pull every environment.
    for (const user of [owner, staying]) {
      expect(await pullSecretsAsClient(testApp, user, development)).toEqual({
        DATABASE_URL: "postgres://rotated",
      });
      expect(
        await pullSecretsAsClient(testApp, user, placeOf("staging")).catch(() => "empty"),
      ).toBe("empty");
    }
  });

  test("the owner cannot be removed", async () => {
    const ownerMember = (await listMembers(testApp, owner, project.projectId)).find(
      (member) => member.role === "owner",
    );

    const response = await testApp.request("DELETE", `/v1/members/${ownerMember?.id ?? ""}`, {
      accessToken: owner.accessToken,
      body: { rotations: [] },
    });

    expect(readErrorCode(response.body)).toBe("OWNER_CANNOT_CHANGE");
  });
});

// Last, because moving the clock 8 days also expires everyone's access token.
describe("invite expiry", () => {
  test("an invite stops working after 7 days", async () => {
    const lateToken = await invite("late@example.invalid", "viewer");

    testApp.advanceClock(8 * 24 * 60 * 60 * 1000);
    const late = await signUpWithKeys(testApp, "late");
    const expired = await testApp.request("POST", `/v1/invites/${lateToken}/accept`, {
      accessToken: late.accessToken,
    });

    expect(readErrorCode(expired.body)).toBe("INVITE_NOT_FOUND");
  });
});

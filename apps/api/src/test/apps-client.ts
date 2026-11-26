import { fromBase64Url, generateEnvKey } from "@envy/crypto";
import { memberCanRead, newUuidV7s } from "@envy/shared";
import { listMembers, wrapAsClient, type TestUser } from "./crypto-client.ts";
import type { TestApp } from "./test-app.ts";

// Plays the client's part in making apps (ADR 0018): a new key per stage,
// wrapped here for every active member.

/** One new environment for each stage, with its key wrapped for every active member. */
export async function makeStageEnvironments(
  testApp: TestApp,
  admin: TestUser,
  projectId: string,
  stages: string[],
) {
  const members = (await listMembers(testApp, admin, projectId)).filter(
    (member) => member.status === "active",
  );
  const ids = newUuidV7s(stages.length);
  const environments = [];
  for (const [index, name] of stages.entries()) {
    const id = ids[index] ?? "";
    const envKey = await generateEnvKey();
    const wrappedKeys = [];
    // Only members who can read this stage get its key (ADR 0019).
    for (const member of members.filter((candidate) =>
      memberCanRead(candidate, { name, isShared: false }),
    )) {
      wrappedKeys.push({
        userId: member.userId,
        wrappedKey: await wrapAsClient(envKey, admin, await fromBase64Url(member.publicKey), {
          environmentId: id,
          keyVersion: 1,
        }),
      });
    }
    environments.push({ id, name, wrappedKeys });
  }
  return environments;
}

export async function createAppAsClient(
  testApp: TestApp,
  admin: TestUser,
  projectId: string,
  name: string,
  stages: string[] = ["development", "staging", "production"],
) {
  return testApp.request("POST", `/v1/projects/${projectId}/apps`, {
    accessToken: admin.accessToken,
    body: { name, environments: await makeStageEnvironments(testApp, admin, projectId, stages) },
  });
}

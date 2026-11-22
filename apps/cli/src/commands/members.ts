import { CliError } from "../core/errors.ts";
import { requireProjectLink } from "../core/project-link.ts";
import { openSession, type Session } from "../core/session.ts";
import {
  findMember,
  fingerprintOf,
  grantMember,
  listMembers,
  removeMember,
  type Member,
} from "../core/team.ts";
import { getUnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";
import { askConfirm } from "../ui/prompts.ts";

type YesOption = { yes?: boolean };
const ROLES = ["admin", "member", "viewer"] as const;
type AssignableRole = (typeof ROLES)[number];

function parseRole(role: string): AssignableRole {
  const match = ROLES.find((candidate) => candidate === role);
  if (match === undefined) {
    throw new CliError(`"${role}" is not a role.`, { hint: `Use one of: ${ROLES.join(", ")}.` });
  }
  return match;
}

async function openTeam() {
  const found = await requireProjectLink();
  const session = await openSession();
  return { projectId: found.link.projectId, session };
}

export async function listTeam(options: { json?: boolean }): Promise<void> {
  const { projectId, session } = await openTeam();
  const members = await listMembers(session, projectId);
  if (options.json === true) {
    const withFingerprints = [];
    for (const member of members) {
      withFingerprints.push({
        ...member,
        fingerprint: member.publicKey === null ? null : await fingerprintOf(member.publicKey),
      });
    }
    output.result(JSON.stringify(withFingerprints, null, 2));
    return;
  }
  for (const member of members) {
    const status = member.status === "pending" ? "  (waiting for keys)" : "";
    output.result(
      `@${member.githubLogin.padEnd(20)} ${member.role.padEnd(7)} ${await fingerprintOf(member.publicKey)}${status}`,
    );
  }
  output.info(
    output.dim(
      "Compare fingerprints with your teammates in person or on a call to be sure they are real.",
    ),
  );
}

export async function inviteMember(email: string, options: { role?: string }): Promise<void> {
  const { projectId, session } = await openTeam();
  const role = parseRole(options.role ?? "member");
  const invite = await session.call((api) =>
    api.v1.projects({ id: projectId }).members.post({ email, role }),
  );
  output.info(`Send this link to ${invite.email} (it works once, for 7 days):`);
  output.result(invite.url);
  output.success(
    `Invited ${invite.email} as ${invite.role}. Once they accept, run envy members grant.`,
  );
}

export async function grantPending(who: string | undefined, options: YesOption): Promise<void> {
  const { projectId, session } = await openTeam();
  await grantPendingInProject(session, projectId, who, options.yes === true);
}

/** Grants access to one or all pending members of a project, checking fingerprints first. */
export async function grantPendingInProject(
  session: Session,
  projectId: string,
  who: string | undefined,
  alreadyConfirmed: boolean,
): Promise<void> {
  const pending = (await listMembers(session, projectId)).filter(
    (member) => member.status === "pending",
  );
  const targets = who === undefined ? pending : [findMember(pending, who)];
  if (targets.length === 0) {
    output.success("Nobody is waiting for access.");
    return;
  }
  const keys = await getUnlockedKeys(session);
  for (const member of targets) {
    if (!(await confirmFingerprint(member, alreadyConfirmed))) {
      output.warn(`Skipped @${member.githubLogin}.`);
      continue;
    }
    await grantMember(session, keys, projectId, member);
    output.success(`@${member.githubLogin} can now pull every environment.`);
  }
}

// A hacked server could swap in its own public key. Checking the
// fingerprint with the person directly is what stops that.
async function confirmFingerprint(member: Member, alreadyConfirmed: boolean): Promise<boolean> {
  output.info(
    `@${member.githubLogin} (${member.email}) key fingerprint: ${await fingerprintOf(member.publicKey)}`,
  );
  if (alreadyConfirmed) {
    return true;
  }
  return askConfirm(
    `Does @${member.githubLogin} see the same fingerprint? Give them access?`,
    "Check the fingerprint with them, then add --yes.",
  );
}

export async function removeFromTeam(who: string, options: YesOption): Promise<void> {
  const { projectId, session } = await openTeam();
  const member = findMember(await listMembers(session, projectId), who);
  if (options.yes !== true) {
    const confirmed = await askConfirm(
      `Remove @${member.githubLogin}? Every environment gets a new key.`,
      "Add --yes to remove them.",
    );
    if (!confirmed) {
      throw new CliError("Stopped. Nobody was removed.");
    }
  }
  await removeMember(session, await getUnlockedKeys(session), projectId, member);
  output.success(`Removed @${member.githubLogin} and changed every environment key.`);
  if (member.status === "active") {
    output.warn(
      `@${member.githubLogin} may still have copies of the old values. Change the real credentials (database passwords, API keys) too.`,
    );
  }
}

export async function changeRole(who: string, role: string): Promise<void> {
  const { projectId, session } = await openTeam();
  const member = findMember(await listMembers(session, projectId), who);
  const updated = await session.call((api) =>
    api.v1.members({ id: member.id }).patch({ role: parseRole(role) }),
  );
  output.success(`@${member.githubLogin} is now ${updated.role}.`);
}

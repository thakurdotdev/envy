import { fingerprint, fromBase64Url } from "@envy/crypto";
import { CliError } from "../core/errors.ts";
import { openSession } from "../core/session.ts";
import { output } from "../ui/output.ts";

/** Accepts an invite link (or just its token). */
export async function acceptInvite(linkOrToken: string): Promise<void> {
  const token = readToken(linkOrToken);
  const session = await openSession();
  const result = await session.call((api) => api.v1.invites({ token }).accept.post());
  output.info(
    `Your key fingerprint: ${output.bold(await fingerprint(await fromBase64Url(result.publicKey)))}`,
  );
  output.info(
    "An admin will see the same code when giving you access. Read it to them to confirm.",
  );
  output.success(
    `Joined ${result.projectName} as ${result.role}. You can pull once an admin runs envy members grant.`,
  );
}

function readToken(linkOrToken: string): string {
  const url = URL.parse(linkOrToken);
  const fromLink = url?.searchParams.get("token");
  const token = fromLink ?? linkOrToken;
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    throw new CliError("That does not look like an invite link.", {
      hint: "Copy the whole link you were sent.",
    });
  }
  return token;
}

import { fingerprint, toBase64Url } from "@envy/crypto";
import { CliError } from "../core/errors.ts";
import { openSession } from "../core/session.ts";
import { getUnlockedKeys } from "../core/unlock.ts";
import { output } from "../ui/output.ts";

/** Accepts an invite link (or just its token). */
export async function acceptInvite(linkOrToken: string): Promise<void> {
  const token = readToken(linkOrToken);
  const session = await openSession();
  // The fingerprint must come from this machine's own key. One worked out
  // from the server's answer would match a key the server swapped in.
  const keys = await getUnlockedKeys(session);
  const result = await session.call((api) => api.v1.invites({ token }).accept.post());
  if (result.publicKey !== (await toBase64Url(keys.publicKey))) {
    throw new CliError("The server has a different public key for you than this machine has.", {
      hint: "Do not let an admin grant you access. Tell them, and check which server you use.",
    });
  }
  output.info(`Your key fingerprint: ${output.bold(await fingerprint(keys.publicKey))}`);
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

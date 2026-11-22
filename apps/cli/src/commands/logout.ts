import { getKeystore } from "../core/keystore.ts";
import { openSession } from "../core/session.ts";
import { resolveApiUrl } from "../core/settings.ts";
import { output } from "../ui/output.ts";

export async function logout(): Promise<void> {
  const apiUrl = await resolveApiUrl();
  try {
    const session = await openSession();
    await session.call((api) => api.v1.auth.logout.post());
  } catch {
    // Already signed out, or the server cannot be reached: the local
    // credentials are removed below either way.
  }
  await getKeystore().clear(apiUrl);
  output.success("Signed out. Your keys were removed from this device.");
}

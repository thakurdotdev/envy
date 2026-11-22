import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Serves scripts/install.sh at /install.sh, so the install command is
// `curl -fsSL https://envy.thakur.dev/install.sh | sh`. It is read once at
// build time and written into the static site, so there is only one copy.
export const dynamic = "force-static";

export async function GET() {
  const script = await readFile(join(process.cwd(), "../../scripts/install.sh"), "utf8");
  return new Response(script, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

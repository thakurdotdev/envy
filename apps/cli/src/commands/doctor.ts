import { openProjectContext } from "../core/context.ts";
import { CliError, EXIT_CODES } from "../core/errors.ts";
import { checkKeys } from "../core/key-check.ts";
import { getKeystore } from "../core/keystore.ts";
import { findProjectLink } from "../core/project-link.ts";
import { readServiceToken } from "../core/service-token.ts";
import { resolveApiUrl } from "../core/settings.ts";
import { output } from "../ui/output.ts";

type Check = { check: string; status: "ok" | "warning" | "problem"; message: string };

/** Checks everything a working setup needs and says what to fix. */
export async function doctor(options: { json?: boolean }): Promise<void> {
  const checks: Check[] = [];
  const add = (check: string, status: Check["status"], message: string) =>
    checks.push({ check, status, message });
  const apiUrl = await resolveApiUrl();

  try {
    const response = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) });
    add(
      "server",
      response.ok ? "ok" : "problem",
      response.ok ? `${apiUrl} is reachable` : `${apiUrl} answered HTTP ${response.status}`,
    );
  } catch {
    add("server", "problem", `Cannot reach ${apiUrl}. Check your connection or ENVY_API_URL.`);
  }

  const usingToken = readServiceToken() !== undefined;
  if (usingToken) {
    add("sign-in", "ok", "Using ENVY_TOKEN (read-only service token)");
  } else {
    const keystore = getKeystore();
    const credentials = await keystore.load(apiUrl);
    add(
      "sign-in",
      credentials === undefined ? "problem" : "ok",
      credentials === undefined ? "Not signed in. Run envy login." : "Signed in",
    );
    add(
      "keychain",
      keystore.kind === "keychain" ? "ok" : "warning",
      keystore.kind === "keychain"
        ? "Keys are kept in the OS keychain"
        : "No OS keychain: your master password is asked for each time (or set ENVY_MASTER_PASSWORD)",
    );
  }

  const found = await findProjectLink().catch((error: unknown) => {
    add(
      "project link",
      "problem",
      error instanceof CliError ? error.message : "The .envy.json file is broken.",
    );
    return undefined;
  });
  if (found === undefined && !checks.some((check) => check.check === "project link")) {
    add(
      "project link",
      usingToken ? "ok" : "problem",
      usingToken ? "No .envy.json (not needed with a token)" : "Not linked. Run envy init.",
    );
  }
  if (found !== undefined) {
    add("project link", "ok", `Linked by ${found.path}`);
    const ignored = Bun.spawnSync(["git", "check-ignore", "-q", found.link.file], {
      cwd: found.folder,
    });
    add(
      "gitignore",
      ignored.exitCode === 0 ? "ok" : "warning",
      ignored.exitCode === 0
        ? `${found.link.file} is ignored by git`
        : `${found.link.file} is not in .gitignore, so it could be committed`,
    );
  }

  try {
    const context = await openProjectContext({ yes: true });
    const key = await context.session.call((api) =>
      api.v1.environments({ id: context.environment.id }).key.get({ query: {} }),
    );
    add("access", "ok", `You can read ${context.environment.name} (key version ${key.keyVersion})`);
    for (const result of await checkKeys(context)) {
      add(result.check, result.status, result.message);
    }
  } catch (error) {
    if (!checks.some((check) => check.status === "problem")) {
      add(
        "access",
        "problem",
        error instanceof CliError
          ? `${error.message} ${error.hint ?? ""}`.trim()
          : "Could not check access.",
      );
    }
  }

  if (options.json === true) {
    output.result(JSON.stringify(checks, null, 2));
  } else {
    const symbols = { ok: "✔", warning: "!", problem: "✖" };
    for (const check of checks) {
      output.result(`${symbols[check.status]} ${check.check.padEnd(14)} ${check.message}`);
    }
  }
  if (checks.some((check) => check.status === "problem")) {
    process.exit(EXIT_CODES.userError);
  }
}

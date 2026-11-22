import { hostname } from "node:os";
import { openInBrowser } from "../core/browser.ts";
import { CliError, EXIT_CODES } from "../core/errors.ts";
import { getKeystore } from "../core/keystore.ts";
import { callApi, createPublicClient, openSession } from "../core/session.ts";
import { resolveApiUrl, updateSettings } from "../core/settings.ts";
import { setUpNewKeys, unlockWithMasterPassword } from "../core/unlock.ts";
import { output } from "../ui/output.ts";
import { isInteractive, withSpinner } from "../ui/prompts.ts";

export type LoginOptions = { apiUrl?: string };

export async function login(options: LoginOptions): Promise<void> {
  if (options.apiUrl !== undefined) {
    await updateSettings({ apiUrl: options.apiUrl.replace(/\/+$/, "") });
  }
  const apiUrl = await resolveApiUrl();
  const publicApi = createPublicClient(apiUrl);

  const device = await callApi(() => publicApi.v1.auth.github.device.post());
  output.info(`Your sign-in code is ${output.bold(device.userCode)}`);
  output.info(`Approve it at ${device.verificationUri}`);
  if (isInteractive()) {
    openInBrowser(device.verificationUri);
  }

  const deviceName = `${hostname()} (${process.platform})`;
  const signedIn = await withSpinner("Waiting for approval on GitHub", () =>
    pollUntilApproved(publicApi, device.deviceCode, deviceName, device),
  );
  await getKeystore().save({
    apiUrl,
    userId: signedIn.userId,
    accessToken: signedIn.accessToken,
    accessTokenExpiresAt: Date.now() + signedIn.accessTokenExpiresIn * 1000,
    refreshToken: signedIn.refreshToken,
  });

  const session = await openSession();
  const me = await session.call((api) => api.v1.me.get());
  await updateSettings({ lastUserLogin: me.githubLogin });

  if (me.keys === null) {
    const { recoveryKeyText } = await setUpNewKeys(session);
    showRecoveryKey(recoveryKeyText);
  } else {
    await unlockWithMasterPassword(session);
  }
  output.success(`Signed in as @${me.githubLogin}. Next: run envy init in a project folder.`);
}

async function pollUntilApproved(
  publicApi: ReturnType<typeof createPublicClient>,
  deviceCode: string,
  deviceName: string,
  device: { intervalSeconds: number; expiresInSeconds: number },
) {
  let intervalMs = device.intervalSeconds * 1000;
  const giveUpAt = Date.now() + device.expiresInSeconds * 1000;
  while (Date.now() < giveUpAt) {
    const result = await callApi(() =>
      publicApi.v1.auth.github.device.poll.post({ deviceCode, deviceName }),
    );
    if (result.status === "complete") {
      return result;
    }
    if (result.status === "slow_down") {
      intervalMs = result.intervalSeconds * 1000;
    }
    await Bun.sleep(intervalMs);
  }
  throw new CliError("The sign-in code expired before it was approved.", {
    exitCode: EXIT_CODES.authError,
    hint: "Run envy login again.",
  });
}

function showRecoveryKey(recoveryKeyText: string): void {
  output.info("");
  output.warn("Your recovery key. Write it down and keep it somewhere safe:");
  output.info("");
  output.info(`    ${output.bold(recoveryKeyText)}`);
  output.info("");
  output.info(
    "It is shown only this once. If you forget your master password, this key is the only way back in.",
  );
  output.info(
    "Without the master password or this key, your secrets cannot be recovered by anyone.",
  );
  output.info("");
}

import { storeNewKeyCopies, unlockWithRecoveryKey } from "../core/key-change.ts";
import { openSession } from "../core/session.ts";
import { cachePrivateKey, chooseMasterPassword, unlockWithMasterPassword } from "../core/unlock.ts";
import { output } from "../ui/output.ts";
import { askPassword } from "../ui/prompts.ts";
import { showRecoveryKey } from "./login.ts";

const NEW_PASSWORD_VARIABLE = "ENVY_NEW_MASTER_PASSWORD";
const RECOVERY_KEY_VARIABLE = "ENVY_RECOVERY_KEY";

/** `envy password`: unlock with the current master password, then choose a new one. */
export async function changeMasterPassword(): Promise<void> {
  const session = await openSession();
  const keys = await unlockWithMasterPassword(session);
  const newPassword = await chooseMasterPassword(NEW_PASSWORD_VARIABLE);
  await storeNewKeyCopies(session, keys.privateKey, { newPassword, newRecoveryKey: false });
  output.success("Changed your master password. Use the new one on every device from now on.");
  output.info(
    output.dim(
      "Your recovery key still works. If someone may have your private key itself, ask a project admin to remove and invite you again.",
    ),
  );
}

/** `envy recover`: the recovery key opens the account; then a new password and a new recovery key. */
export async function recoverWithRecoveryKey(): Promise<void> {
  const session = await openSession();
  const recoveryKeyText =
    process.env[RECOVERY_KEY_VARIABLE] ||
    (await askPassword("Recovery key", `Set ${RECOVERY_KEY_VARIABLE}, or run this in a terminal.`));
  const keys = await unlockWithRecoveryKey(session, recoveryKeyText);
  const newPassword = await chooseMasterPassword(NEW_PASSWORD_VARIABLE);
  // The old recovery key was typed in, so it is replaced as well.
  const { recoveryKeyText: newRecoveryKeyText } = await storeNewKeyCopies(
    session,
    keys.privateKey,
    { newPassword, newRecoveryKey: true },
  );
  await cachePrivateKey(session, keys.privateKey);
  if (newRecoveryKeyText !== undefined) {
    showRecoveryKey(newRecoveryKeyText);
  }
  output.success(
    "You are back in, with a new master password. The old recovery key no longer works.",
  );
}

"use client";

import { isCryptoError } from "@envy/crypto";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { MINIMUM_PASSWORD_LENGTH } from "@/lib/envy";
import { useSession } from "@/lib/session";
import { AuthLayout, Requirement } from "./auth-layout";
import { PasswordInput } from "./password-input";
import { SaveRecoveryKey } from "./set-up-keys";

/**
 * Forgot the master password: the recovery key opens the keys, then a new
 * master password is chosen and a new recovery key replaces the old one.
 */
export function Recover({ onCancel }: { onCancel: () => void }) {
  const session = useSession();
  const [newRecoveryKey, setNewRecoveryKey] = useState<string | undefined>();
  const [recoveryKey, setRecoveryKey] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const longEnough = password.length >= MINIMUM_PASSWORD_LENGTH;
  const matches = password !== "" && password === again;

  if (newRecoveryKey !== undefined) {
    return <SaveRecoveryKey recoveryKey={newRecoveryKey} onDone={session.finishSetUp} />;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!longEnough || !matches || recoveryKey.trim() === "") {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setNewRecoveryKey(await session.recover(recoveryKey, password));
    } catch (caught) {
      setError(
        isCryptoError(caught)
          ? caught.code === "INVALID_RECOVERY_KEY"
            ? "That recovery key has a typo. Check each group of characters."
            : "That recovery key does not open this account."
          : errorMessage(caught),
      );
    } finally {
      setPassword("");
      setAgain("");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Use your recovery key"
      description="Type the recovery key you saved when you set up Envy, then choose a new master password."
      footer={
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={onCancel}
        >
          Back to unlock
        </button>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recovery-key">Recovery key</Label>
          <Input
            id="recovery-key"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className="font-mono"
            value={recoveryKey}
            onChange={(event) => setRecoveryKey(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recover-password">New master password</Label>
          <PasswordInput
            id="recover-password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="recover-password-again">Type it again</Label>
          <PasswordInput
            id="recover-password-again"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            aria-invalid={again !== "" && !matches}
          />
        </div>
        <ul className="space-y-1.5 text-sm" aria-label="Password rules">
          <Requirement met={longEnough}>At least {MINIMUM_PASSWORD_LENGTH} characters</Requirement>
          <Requirement met={matches}>Both passwords match</Requirement>
        </ul>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-10 w-full"
          disabled={busy || !longEnough || !matches || recoveryKey.trim() === ""}
        >
          {busy ? <Spinner /> : null}
          Get back in
        </Button>
      </form>
    </AuthLayout>
  );
}

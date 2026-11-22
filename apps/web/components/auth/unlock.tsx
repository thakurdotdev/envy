"use client";

import { isCryptoError } from "@envy/crypto";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import { AuthLayout } from "./auth-layout";
import { PasswordInput } from "./password-input";

export function Unlock({ githubLogin }: { githubLogin: string }) {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await session.unlock(password);
    } catch (caught) {
      setError(isCryptoError(caught) ? "That master password is not right." : errorMessage(caught));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Unlock your secrets"
      description={
        <>
          Signed in as <span className="font-medium text-foreground">@{githubLogin}</span>. Enter
          your master password to decrypt your projects in this tab.
        </>
      }
      footer={
        <>
          Not you?{" "}
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => void session.signOut()}
          >
            Sign out
          </button>
        </>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="master-password">Master password</Label>
          <PasswordInput
            id="master-password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error !== undefined}
            aria-describedby={error === undefined ? "unlock-hint" : "unlock-error"}
          />
          {error === undefined ? (
            <p id="unlock-hint" className="text-xs text-muted-foreground">
              It never leaves this browser. The tab locks again after 15 minutes of no activity.
            </p>
          ) : (
            <p id="unlock-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" className="h-10 w-full" disabled={busy || password === ""}>
          {busy ? <Spinner /> : null}
          Unlock
        </Button>
      </form>
    </AuthLayout>
  );
}

"use client";

import { isCryptoError } from "@envy/crypto";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PasswordInput } from "@/components/auth/password-input";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { MINIMUM_PASSWORD_LENGTH } from "@/lib/envy";
import { useSession } from "@/lib/session";

/**
 * A new master password for every device. The keypair and the recovery key
 * stay the same; only the encrypted copy of the private key on the server
 * changes.
 */
export function ChangePassword() {
  const session = useSession();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const longEnough = next.length >= MINIMUM_PASSWORD_LENGTH;
  const matches = next !== "" && next === again;
  const ready = current !== "" && longEnough && matches;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await session.changePassword(current, next);
      toast.success("Master password changed. Use the new one on every device.");
      setNext("");
      setAgain("");
    } catch (caught) {
      setError(
        isCryptoError(caught) ? "The current master password is not right." : errorMessage(caught),
      );
    } finally {
      setCurrent("");
      setBusy(false);
    }
  }

  return (
    <section className="mt-12">
      <PageHeader
        title="Master password"
        description="Change it here for every device. Your recovery key keeps working."
      />
      <form onSubmit={(event) => void submit(event)} className="max-w-sm space-y-4">
        <div className="space-y-2">
          <Label htmlFor="current-password">Current master password</Label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="next-password">New master password</Label>
          <PasswordInput
            id="next-password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            aria-describedby="next-password-hint"
          />
          <p id="next-password-hint" className="text-xs text-muted-foreground">
            At least {MINIMUM_PASSWORD_LENGTH} characters.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="next-password-again">Type it again</Label>
          <PasswordInput
            id="next-password-again"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
            aria-invalid={again !== "" && !matches}
          />
        </div>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy || !ready}>
          {busy ? <Spinner /> : null}
          Change master password
        </Button>
      </form>
    </section>
  );
}

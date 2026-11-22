"use client";

import { Check, Copy, Download, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { errorMessage } from "@/lib/api";
import { MINIMUM_PASSWORD_LENGTH } from "@/lib/envy";
import { useSession } from "@/lib/session";
import { AuthLayout, Requirement } from "./auth-layout";
import { PasswordInput } from "./password-input";

/** First visit: choose a master password, then save the recovery key. */
export function SetUpKeys({ githubLogin }: { githubLogin: string }) {
  const session = useSession();
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>();

  if (recoveryKey !== undefined) {
    return <SaveRecoveryKey recoveryKey={recoveryKey} onDone={session.finishSetUp} />;
  }
  return (
    <ChoosePassword
      githubLogin={githubLogin}
      onSetUp={async (password) => setRecoveryKey(await session.setUp(password))}
    />
  );
}

function ChoosePassword({
  githubLogin,
  onSetUp,
}: {
  githubLogin: string;
  onSetUp: (password: string) => Promise<void>;
}) {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const longEnough = password.length >= MINIMUM_PASSWORD_LENGTH;
  const matches = password !== "" && password === again;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!longEnough || !matches) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await onSetUp(password);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPassword("");
      setAgain("");
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      step={1}
      title="Choose a master password"
      description={
        <>
          Welcome, <span className="font-medium text-foreground">@{githubLogin}</span>. This
          password locks your keys on this device. We never see it, so we can&apos;t reset it.
        </>
      }
      footer={
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          onClick={() => void session.signOut()}
        >
          Sign out
        </button>
      }
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="new-password">Master password</Label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            autoFocus
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-password-again">Type it again</Label>
          <PasswordInput
            id="new-password-again"
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
        <p className="text-xs text-muted-foreground">
          Tip: a few random words, like a short sentence, are easy to remember and hard to guess.
        </p>
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          className="h-10 w-full"
          disabled={busy || !longEnough || !matches}
        >
          {busy ? <Spinner /> : null}
          Set master password
        </Button>
        {busy ? (
          <p className="text-center text-xs text-muted-foreground" aria-live="polite">
            Making your keys. This takes a few seconds.
          </p>
        ) : null}
      </form>
    </AuthLayout>
  );
}

function SaveRecoveryKey({ recoveryKey, onDone }: { recoveryKey: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(recoveryKey);
    setCopied(true);
    toast.success("Recovery key copied. Paste it somewhere safe.");
  }

  function download() {
    const text = `Envy recovery key\n\n${recoveryKey}\n\nKeep this somewhere safe, like a password manager.\nWith your master password lost, this is the only way back in.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "envy-recovery-key.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AuthLayout
      step={2}
      title="Save your recovery key"
      description="If you forget your master password, this key is the only way back in."
    >
      <div className="space-y-4">
        <div
          className="grid grid-cols-3 gap-x-3 gap-y-2.5 rounded-lg border border-code-border bg-code p-5 text-center font-mono text-sm tracking-wider text-code-foreground sm:grid-cols-4"
          data-testid="recovery-key"
          aria-label={`Recovery key: ${recoveryKey}`}
        >
          {recoveryKey.split("-").map((group, index) => (
            <span key={`${index}-${group}`}>{group}</span>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" onClick={download}>
            <Download /> Download
          </Button>
        </div>
        <div className="flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            It is shown only once. Without your password and this key, nobody can recover your
            secrets, not even us.
          </p>
        </div>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={saved} onCheckedChange={(value) => setSaved(value === true)} />I have
          saved my recovery key
        </Label>
        <Button size="lg" className="h-10 w-full" disabled={!saved} onClick={onDone}>
          Continue
        </Button>
      </div>
    </AuthLayout>
  );
}

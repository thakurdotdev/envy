"use client";

import { isCryptoError } from "@envy/crypto";
import { useState, type FormEvent, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, signInUrl } from "@/lib/api";
import { MINIMUM_PASSWORD_LENGTH } from "@/lib/envy";
import { useSession } from "@/lib/session";

/** Shows its children only to a signed-in user whose keys are unlocked. */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  switch (session.status) {
    case "loading":
      return (
        <div className="mx-auto mt-24 max-w-sm space-y-3" role="status" aria-label="Loading">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-24 w-full" />
        </div>
      );
    case "error":
      return (
        <Centered>
          <Alert variant="destructive">
            <AlertTitle>Something went wrong</AlertTitle>
            <AlertDescription>{session.message}</AlertDescription>
          </Alert>
          <Button className="mt-4" onClick={session.retry}>
            Try again
          </Button>
        </Centered>
      );
    case "signedOut":
      return <SignIn />;
    case "setup":
      return <SetUpKeys />;
    case "locked":
      return <Unlock />;
    case "unlocked":
      return children;
  }
  return null;
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto mt-24 max-w-sm px-4">{children}</main>;
}

function SignIn() {
  return (
    <Centered>
      <Card>
        <CardHeader>
          <CardTitle>Envy</CardTitle>
          <CardDescription>
            Share .env secrets with your team. Encrypted in your browser.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <a href={signInUrl()}>Sign in with GitHub</a>
          </Button>
        </CardFooter>
      </Card>
    </Centered>
  );
}

function Unlock() {
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
    <Centered>
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <CardHeader>
            <CardTitle>Unlock</CardTitle>
            <CardDescription>
              Your master password never leaves this browser. The key stays in this tab only and is
              forgotten after 15 minutes of no activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4 space-y-2">
            <Label htmlFor="master-password">Master password</Label>
            <Input
              id="master-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={error !== undefined}
              aria-describedby={error === undefined ? undefined : "unlock-error"}
            />
            {error === undefined ? null : (
              <p id="unlock-error" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-4 flex justify-between">
            <Button type="button" variant="ghost" onClick={() => void session.signOut()}>
              Sign out
            </Button>
            <Button type="submit" disabled={busy || password === ""}>
              {busy ? "Unlocking…" : "Unlock"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Centered>
  );
}

function SetUpKeys() {
  const session = useSession();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState<string | undefined>();
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MINIMUM_PASSWORD_LENGTH) {
      setError(`Use at least ${MINIMUM_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== again) {
      setError("The two passwords are different.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      setRecoveryKey(await session.setUp(password));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPassword("");
      setAgain("");
      setBusy(false);
    }
  }

  if (recoveryKey !== undefined) {
    return (
      <Centered>
        <Card>
          <CardHeader>
            <CardTitle>Your recovery key</CardTitle>
            <CardDescription>
              Write it down and keep it somewhere safe. It is shown only this once. If you forget
              your master password, it is the only way back in; without both, nobody can recover
              your secrets.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4 space-y-4">
            <p
              className="break-all rounded-md border bg-muted p-3 font-mono text-sm"
              data-testid="recovery-key"
            >
              {recoveryKey}
            </p>
            <div className="flex items-center gap-2">
              <Checkbox
                id="saved"
                checked={saved}
                onCheckedChange={(value) => setSaved(value === true)}
              />
              <Label htmlFor="saved">I have saved my recovery key</Label>
            </div>
          </CardContent>
          <CardFooter className="mt-4">
            <Button className="w-full" disabled={!saved} onClick={session.finishSetUp}>
              Continue
            </Button>
          </CardFooter>
        </Card>
      </Centered>
    );
  }

  return (
    <Centered>
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <CardHeader>
            <CardTitle>Choose a master password</CardTitle>
            <CardDescription>
              It encrypts your keys and never leaves this device. Use at least{" "}
              {MINIMUM_PASSWORD_LENGTH} characters.
            </CardDescription>
          </CardHeader>
          <CardContent className="mt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="new-password">Master password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password-again">Type it again</Label>
              <Input
                id="new-password-again"
                type="password"
                autoComplete="new-password"
                value={again}
                onChange={(event) => setAgain(event.target.value)}
              />
            </div>
            {error === undefined ? null : (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </CardContent>
          <CardFooter className="mt-4">
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Setting up…" : "Set master password"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </Centered>
  );
}

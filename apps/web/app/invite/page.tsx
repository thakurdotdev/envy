"use client";

import { fingerprint, fromBase64Url } from "@envy/crypto";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { call, errorMessage } from "@/lib/api";

export default function InvitePage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows label="Loading invite" />}>
        <AcceptInvite />
      </Suspense>
    </AppShell>
  );
}

function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const [result, setResult] = useState<
    { projectName: string; role: string; fingerprint: string } | undefined
  >();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function accept() {
    setBusy(true);
    setError(undefined);
    try {
      const joined = await call((api) => api.v1.invites({ token }).accept.post());
      setResult({
        projectName: joined.projectName,
        role: joined.role,
        fingerprint: await fingerprint(await fromBase64Url(joined.publicKey)),
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>
          {result === undefined ? "Join a project" : `You joined ${result.projectName}`}
        </CardTitle>
        <CardDescription>
          {result === undefined
            ? "Accept the invite you were sent. An admin then gives you the keys."
            : `As ${result.role}. You can read secrets once an admin gives you access.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {result === undefined ? null : (
          <>
            <p className="text-sm">
              Your key fingerprint. Read it to the admin so they know the key is really yours:
            </p>
            <p className="rounded-md border bg-muted p-3 font-mono">{result.fingerprint}</p>
          </>
        )}
        {error === undefined ? null : (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      <CardFooter>
        {result === undefined ? (
          <Button onClick={() => void accept()} disabled={busy || token === ""}>
            {busy ? "Joining…" : "Accept invite"}
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/">Go to projects</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

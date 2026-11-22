"use client";

import { fingerprint, toBase64Url } from "@envy/crypto";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { LoadingRows } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { forgetCached } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";
import { useUnlocked } from "@/lib/session";

export default function InvitePage() {
  useDocumentTitle("Join a project");
  return (
    <Suspense fallback={<LoadingRows label="Loading invite" />}>
      <AcceptInvite />
    </Suspense>
  );
}

function AcceptInvite() {
  const token = useSearchParams().get("token") ?? "";
  const { keys } = useUnlocked();
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
      // Worked out from this browser's own key: one from the server's answer
      // would match a key the server swapped in.
      if (joined.publicKey !== (await toBase64Url(keys.publicKey))) {
        setError(
          "The server has a different public key for you than this browser has. Do not let an admin grant you access, and tell them.",
        );
        return;
      }
      forgetCached("projects");
      setResult({
        projectName: joined.projectName,
        role: joined.role,
        fingerprint: await fingerprint(keys.publicKey),
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mx-auto mt-8 max-w-md">
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
            <p className="rounded-md bg-code p-3 text-center font-mono tracking-wider text-code-foreground">
              {result.fingerprint}
            </p>
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
            {busy ? <Spinner /> : null}
            Accept invite
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href="/projects">Go to projects</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

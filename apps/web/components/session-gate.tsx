"use client";

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/lib/session";
import { AuthLayout } from "./auth/auth-layout";
import { SetUpKeys } from "./auth/set-up-keys";
import { SignIn } from "./auth/sign-in";
import { Unlock } from "./auth/unlock";

/** Shows its children only to a signed-in user whose keys are unlocked. */
export function SessionGate({ children }: { children: ReactNode }) {
  const session = useSession();
  switch (session.status) {
    case "loading":
      return (
        <div
          className="flex min-h-svh items-center justify-center"
          role="status"
          aria-label="Loading"
        >
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      );
    case "error":
      return (
        <AuthLayout title="Something went wrong" description="Envy could not start.">
          <Alert variant="destructive">
            <AlertTitle>Could not load your account</AlertTitle>
            <AlertDescription>{session.message}</AlertDescription>
          </Alert>
          <Button size="lg" className="mt-4 h-10 w-full" onClick={session.retry}>
            Try again
          </Button>
        </AuthLayout>
      );
    case "signedOut":
      return <SignIn />;
    case "setup":
      return <SetUpKeys githubLogin={session.profile.githubLogin} />;
    case "locked":
      return <Unlock githubLogin={session.profile.githubLogin} />;
    case "unlocked":
      return children;
  }
  return null;
}

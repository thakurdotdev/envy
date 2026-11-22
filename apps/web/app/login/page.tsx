"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signInUrl } from "@/lib/api";

// The API sends the browser here when GitHub sign-in fails, with ?error=<code>.
const MESSAGES: Record<string, string> = {
  OAUTH_STATE_MISMATCH: "The sign-in link was old or opened in another browser.",
  GITHUB_EMAIL_MISSING:
    "Your GitHub account has no verified primary email. Add one on GitHub first.",
  GITHUB_LOGIN_FAILED: "GitHub sign-in was cancelled or did not work.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginError />
    </Suspense>
  );
}

function LoginError() {
  const code = useSearchParams().get("error") ?? "";
  return (
    <main className="mx-auto mt-24 max-w-sm space-y-4 px-4">
      <Alert variant="destructive">
        <AlertTitle>Sign-in did not work</AlertTitle>
        <AlertDescription>
          {MESSAGES[code] ?? "Something went wrong during sign-in."}
        </AlertDescription>
      </Alert>
      <Button asChild className="w-full">
        <a href={signInUrl()}>Try again with GitHub</a>
      </Button>
    </main>
  );
}

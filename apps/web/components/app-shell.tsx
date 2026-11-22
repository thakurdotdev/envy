"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useUnlocked, useSession } from "@/lib/session";
import { SessionGate } from "./session-gate";

/** The signed-in page frame: header with navigation, then the page. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <SessionGate>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </SessionGate>
  );
}

function Header() {
  const session = useSession();
  const { profile } = useUnlocked();
  return (
    <header className="border-b">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Link href="/projects" className="font-semibold">
          Envy
        </Link>
        <Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">
          Projects
        </Link>
        <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground">
          Devices
        </Link>
        <span className="ml-auto text-sm text-muted-foreground">@{profile.githubLogin}</span>
        <Button variant="outline" size="sm" onClick={session.lock}>
          Lock
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void session.signOut()}>
          Sign out
        </Button>
      </nav>
    </header>
  );
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

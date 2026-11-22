"use client";

import { Lock, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession, useUnlocked } from "@/lib/session";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand-mark";
import { SessionGate } from "./session-gate";

// Pages that belong to a project, so "Projects" stays highlighted on them.
const PROJECT_PAGES = ["/projects", "/project", "/members", "/tokens", "/audit"];

/**
 * The frame around every dashboard page. It lives in the layout, so the
 * header stays put while pages change instead of being rebuilt each time.
 * The sign-in error page has its own full-screen layout.
 */
export function DashboardFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") {
    return children;
  }
  return (
    <SessionGate>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-ring"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </SessionGate>
  );
}

function Header() {
  const session = useSession();
  const { profile } = useUnlocked();
  const pathname = usePathname();
  const isProjectPage = PROJECT_PAGES.includes(pathname);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center gap-1 px-4 sm:px-6"
      >
        <Link
          href="/projects"
          className="mr-2 rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none sm:mr-5"
        >
          <BrandMark />
        </Link>
        <NavLink href="/projects" active={isProjectPage}>
          Projects
        </NavLink>
        <NavLink href="/settings" active={pathname === "/settings"}>
          Devices
        </NavLink>
        <span
          className="ml-auto hidden max-w-48 truncate font-mono text-xs text-muted-foreground sm:inline"
          title={profile.email}
        >
          @{profile.githubLogin}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto sm:ml-3"
          onClick={session.lock}
          title="Forget the unlocked key in this tab. You stay signed in."
        >
          <Lock /> Lock
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sign out"
          className="text-muted-foreground"
          onClick={() => void session.signOut()}
        >
          <LogOut /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      </nav>
    </header>
  );
}

/** A header link. The page you are on gets a thin brand-red line under it. */
function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative inline-flex h-14 items-center px-2 text-sm transition-colors after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:after:bg-ring sm:px-2.5 sm:after:inset-x-2.5",
        active ? "font-medium text-foreground after:bg-brand" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

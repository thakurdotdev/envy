"use client";

import { Lock, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useSession, useUnlocked } from "@/lib/session";
import { cn } from "@/lib/utils";
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
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-8">
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
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-5xl items-center gap-1 px-4 sm:gap-2"
      >
        <Link href="/projects" className="mr-2 font-semibold tracking-tight sm:mr-4">
          Envy
        </Link>
        <NavLink href="/projects" active={isProjectPage}>
          Projects
        </NavLink>
        <NavLink href="/settings" active={pathname === "/settings"}>
          Devices
        </NavLink>
        <span
          className="ml-auto hidden truncate text-sm text-muted-foreground sm:inline"
          title={profile.email}
        >
          @{profile.githubLogin}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto sm:ml-2"
          onClick={session.lock}
          title="Forget the unlocked key in this tab. You stay signed in."
        >
          <Lock /> Lock
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Sign out"
          onClick={() => void session.signOut()}
        >
          <LogOut /> <span className="hidden sm:inline">Sign out</span>
        </Button>
      </nav>
    </header>
  );
}

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
        "rounded-md px-2 py-1.5 text-sm transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        active ? "font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      {children}
    </Link>
  );
}

export function PageTitle({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description === undefined ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

/** A section heading inside a page, with optional actions on the right. */
export function SectionTitle({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

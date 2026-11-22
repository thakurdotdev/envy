import Link from "next/link";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "./links";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span
        aria-hidden
        className="flex size-6 items-center justify-center rounded-md bg-red-600 text-xs text-white"
      >
        E
      </span>
      Envy
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
        <Logo />
        <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
          Docs
        </Link>
        <a href={GITHUB_URL} className="text-sm text-muted-foreground hover:text-foreground">
          GitHub
        </a>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href="/projects">Open dashboard</a>
        </Button>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 text-sm text-muted-foreground">
        <span>Envy</span>
        <Link href="/docs" className="hover:text-foreground">
          Docs
        </Link>
        <a href={GITHUB_URL} className="hover:text-foreground">
          GitHub
        </a>
        <a href="/projects" className="hover:text-foreground">
          Dashboard
        </a>
      </div>
    </footer>
  );
}

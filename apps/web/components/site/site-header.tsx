import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { GITHUB_URL } from "./links";

const LINK = "text-sm text-muted-foreground transition-colors hover:text-foreground";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center gap-5 px-4 sm:gap-7 sm:px-6"
      >
        <Link
          href="/"
          className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <BrandMark />
        </Link>
        <Link href="/docs" className={LINK}>
          Docs
        </Link>
        <a href={GITHUB_URL} className={LINK}>
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
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="space-y-2">
          <BrandMark size="sm" />
          <p className="text-sm text-muted-foreground">Secrets stay encrypted on your devices.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/docs" className={LINK}>
            Docs
          </Link>
          <a href={GITHUB_URL} className={LINK}>
            GitHub
          </a>
          <a href="/projects" className={LINK}>
            Dashboard
          </a>
        </nav>
      </div>
    </footer>
  );
}

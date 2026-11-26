import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { GITHUB_URL, RELEASES_URL } from "./links";

const LINK =
  "rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md">
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
        {/* Section links only make sense on wide screens; phones scroll. */}
        <Link href="/#how-it-works" className={`${LINK} hidden md:inline`}>
          How it works
        </Link>
        <Link href="/#security" className={`${LINK} hidden md:inline`}>
          Security
        </Link>
        <Link href="/docs" className={LINK}>
          Docs
        </Link>
        <a href={GITHUB_URL} className={LINK}>
          GitHub
        </a>
        <Button asChild variant="outline" size="sm" className="ml-auto">
          <a href="/projects">
            <span className="sm:hidden">Dashboard</span>
            <span className="hidden sm:inline">Open dashboard</span>
          </a>
        </Button>
      </nav>
    </header>
  );
}

const FOOTER_GROUPS = [
  {
    title: "Use it",
    links: [
      { href: "/docs", text: "Docs" },
      { href: "/docs#commands", text: "All commands" },
      { href: "/projects", text: "Dashboard" },
    ],
  },
  {
    title: "Source",
    links: [
      { href: GITHUB_URL, text: "GitHub" },
      { href: RELEASES_URL, text: "Releases" },
      { href: `${GITHUB_URL}/blob/main/docs/threat-model.md`, text: "Threat model" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-6">
        <div className="space-y-3">
          <BrandMark size="sm" />
          <p className="max-w-xs text-sm text-pretty text-muted-foreground">
            Encrypted .env sharing for teams. Your secrets are locked before they leave your
            machine.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-16 gap-y-8">
          {FOOTER_GROUPS.map((group) => (
            <nav key={group.title} aria-label={group.title} className="space-y-3">
              <p className="text-sm font-medium">{group.title}</p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.text}>
                    {link.href.startsWith("/") && !link.href.startsWith("/projects") ? (
                      <Link href={link.href} className={LINK}>
                        {link.text}
                      </Link>
                    ) : (
                      <a href={link.href} className={LINK}>
                        {link.text}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
    </footer>
  );
}

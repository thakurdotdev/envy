import { BrandMark } from "@/components/brand-mark";
import { DASHBOARD_POLICY, isProductionBuild } from "@/lib/content-security-policy";

// Any unknown address. It holds nothing, but gets the strict policy too.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      {isProductionBuild ? (
        <meta httpEquiv="Content-Security-Policy" content={DASHBOARD_POLICY} />
      ) : null}
      <a
        href="/"
        className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <BrandMark />
      </a>
      <p className="mt-10 font-mono text-sm text-muted-foreground">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 max-w-sm text-sm text-pretty text-muted-foreground">
        This page does not exist. Check the address, or start from the home page.
      </p>
      <a
        href="/"
        className="mt-6 inline-flex h-9 items-center rounded-lg border bg-card px-4 text-sm font-medium shadow-xs transition-colors hover:bg-muted"
      >
        Go to the home page
      </a>
    </main>
  );
}

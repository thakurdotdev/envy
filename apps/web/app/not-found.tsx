import { DASHBOARD_POLICY, isProductionBuild } from "@/lib/content-security-policy";

// Any unknown address. It holds nothing, but gets the strict policy too.
export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-3 px-4 text-center">
      {isProductionBuild ? (
        <meta httpEquiv="Content-Security-Policy" content={DASHBOARD_POLICY} />
      ) : null}
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="text-sm text-muted-foreground">
        Check the address, or start from the home page.
      </p>
      <a href="/" className="text-sm underline underline-offset-4">
        Go to the home page
      </a>
    </main>
  );
}

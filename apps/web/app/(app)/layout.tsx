import type { ReactNode } from "react";
import { DashboardFrame } from "@/components/app-shell";
import { SessionProvider } from "@/lib/session";

// Only the dashboard needs a session. The landing page and docs never call the API.
// The frame (header, unlock screen) lives here so it is not rebuilt on every page change.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <DashboardFrame>{children}</DashboardFrame>
    </SessionProvider>
  );
}

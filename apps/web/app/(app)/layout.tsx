import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";

// Only the dashboard needs a session. The landing page and docs never call the API.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

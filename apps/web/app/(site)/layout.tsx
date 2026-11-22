import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}

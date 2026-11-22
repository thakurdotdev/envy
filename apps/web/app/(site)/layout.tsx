import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/site/site-header";
import {
  ANALYTICS_DOMAIN,
  ANALYTICS_ORIGIN,
  ANALYTICS_WEBSITE_ID,
  isProductionBuild,
  PUBLIC_POLICY,
} from "@/lib/content-security-policy";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      {isProductionBuild ? (
        <>
          {/* React places this <meta> in the document head. */}
          <meta httpEquiv="Content-Security-Policy" content={PUBLIC_POLICY} />
          {/* Page views on the public pages only; the dashboard never loads it. */}
          <script
            defer
            src={`${ANALYTICS_ORIGIN}/script.js`}
            data-website-id={ANALYTICS_WEBSITE_ID}
            data-domains={ANALYTICS_DOMAIN}
          />
        </>
      ) : null}
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}

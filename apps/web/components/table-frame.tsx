import type { ReactNode } from "react";

/** A bordered card around a table, so every list in the dashboard has the same edge. */
export function TableFrame({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs [&_thead]:bg-muted/40">
      {children}
    </div>
  );
}

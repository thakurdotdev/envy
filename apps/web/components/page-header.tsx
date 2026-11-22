import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The top of a dashboard page: its title, a short line on what it is for,
 * and room for actions. The actions move under the text on narrow screens.
 */
export function PageHeader({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons for the page, such as "New project". */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 space-y-1.5">
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description === undefined ? null : (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {children === undefined ? null : (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      )}
    </div>
  );
}

/** A heading inside a page, with a muted line under it and optional actions. */
export function SectionHeader({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 space-y-1">
        <h2 id={id} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description === undefined ? null : (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}

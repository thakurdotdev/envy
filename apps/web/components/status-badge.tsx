import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** A project role (owner, admin, member, viewer), drawn the same way on every page. */
export function RoleBadge({ role, ...props }: { role: string } & ComponentProps<typeof Badge>) {
  return (
    <Badge variant="secondary" {...props} className={cn("font-normal", props.className)}>
      {role}
    </Badge>
  );
}

const DOT = {
  neutral: "bg-muted-foreground/60",
  warning: "bg-warning",
  success: "bg-success",
  brand: "bg-brand",
} as const;

/**
 * A short state such as "revoked" or "waiting for access". The colour is
 * only a small dot, so the words stay easy to read in both themes.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: keyof typeof DOT;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-normal",
        tone === "neutral" ? "text-muted-foreground" : "text-foreground",
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT[tone])} />
      {children}
    </Badge>
  );
}

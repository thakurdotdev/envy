import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A command or file name inside a sentence, such as `envy login`. */
export function InlineCode({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <code
      className={cn(
        "rounded border border-border/60 bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground",
        className,
      )}
    >
      {children}
    </code>
  );
}

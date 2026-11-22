import { cn } from "@/lib/utils";

/**
 * The Envy logo: a red rounded square with an "E", and the word "Envy" next
 * to it. Used in every header and footer, so the brand looks the same everywhere.
 */
export function BrandMark({
  size = "md",
  showName = true,
  className,
}: {
  size?: "sm" | "md";
  /** False for the square alone, for example above a sign-in card. */
  showName?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-semibold tracking-tight text-foreground",
        size === "sm" ? "text-sm" : "text-base",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-brand font-semibold text-brand-foreground",
          size === "sm" ? "size-5 text-[0.7rem]" : "size-6 text-xs",
        )}
      >
        E
      </span>
      {showName ? "Envy" : <span className="sr-only">Envy</span>}
    </span>
  );
}

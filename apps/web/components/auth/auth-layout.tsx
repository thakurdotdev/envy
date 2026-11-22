import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEPS = ["Sign in", "Master password", "Recovery key"];

/** The frame for signing in, setting up and unlocking: logo, card, help link. */
export function AuthLayout({
  title,
  description,
  step,
  children,
  footer,
}: {
  title: string;
  description: ReactNode;
  /** Shown during first-time setup: which of the three steps this is (0-based). */
  step?: number;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
        <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-red-600 text-xs text-white"
          >
            E
          </span>
          Envy
        </a>
        <a href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
          Help
        </a>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-md space-y-6">
          {step === undefined ? null : <Steps current={step} />}
          <div className="rounded-xl border bg-background p-6 shadow-sm sm:p-8">
            <div className="mb-6 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
              <div className="text-sm text-muted-foreground">{description}</div>
            </div>
            {children}
          </div>
          {footer === undefined ? null : (
            <div className="text-center text-sm text-muted-foreground">{footer}</div>
          )}
        </div>
      </main>
    </div>
  );
}

function Steps({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Setup steps">
      {STEPS.map((label, index) => (
        <li key={label} className="flex flex-1 flex-col gap-1.5">
          <span
            className={cn("h-1 rounded-full", index <= current ? "bg-foreground" : "bg-border")}
          />
          <span
            aria-current={index === current ? "step" : undefined}
            className={index === current ? "font-medium" : "text-muted-foreground"}
          >
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A line in a checklist that turns green when it is met. */
export function Requirement({ met, children }: { met: boolean; children: ReactNode }) {
  return (
    <li
      className={cn(
        "flex items-center gap-2",
        met ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 items-center justify-center rounded-full border text-[10px]",
          met && "border-emerald-500 bg-emerald-500 text-white",
        )}
      >
        {met ? <Check className="size-3" strokeWidth={3} /> : null}
      </span>
      {children}
      <span className="sr-only">{met ? "(done)" : "(not yet)"}</span>
    </li>
  );
}

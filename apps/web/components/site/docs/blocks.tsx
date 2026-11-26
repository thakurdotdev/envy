import { Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { InlineCode } from "@/components/inline-code";
import { cn } from "@/lib/utils";
import type { DocSectionId } from "./sections";

/** Small pieces the docs page is built from, so every section looks the same. */

export const Code = InlineCode;

export function DocSection({
  id,
  title,
  lead,
  children,
}: {
  id: DocSectionId;
  title: string;
  /** One sentence under the title that says what the section is for. */
  lead?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28 lg:scroll-mt-20">
      <h2 id={`${id}-title`} className="text-2xl font-semibold tracking-[-0.02em]">
        <a href={`#${id}`} className="group inline-flex items-baseline gap-2">
          {title}
          <span
            aria-hidden
            className="text-base font-normal text-muted-foreground/0 transition-colors group-hover:text-muted-foreground"
          >
            #
          </span>
        </a>
      </h2>
      {lead === undefined ? null : <p className="mt-2 text-pretty text-muted-foreground">{lead}</p>}
      <div className="mt-6 space-y-5 leading-7 text-pretty [&>ul]:list-disc [&>ul]:space-y-1.5 [&>ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** A title for a group of sections, with a rule above it. */
export function GroupTitle({ children }: { children: string }) {
  return (
    <p className="mb-6 border-t pt-12 font-mono text-xs text-brand first:border-t-0 first:pt-0">
      {children}
    </p>
  );
}

/** Commands on the left, what they do on the right. */
export function Commands({ rows }: { rows: [command: string, meaning: ReactNode][] }) {
  return (
    <dl className="divide-y overflow-hidden rounded-lg border bg-card shadow-xs">
      {rows.map(([command, meaning]) => (
        <div
          key={command}
          className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)] sm:gap-6"
        >
          <dt className="font-mono text-[0.8125rem] leading-6 [overflow-wrap:anywhere]">
            {command}
          </dt>
          <dd className="text-sm leading-6 text-muted-foreground">{meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A file or a longer command shown in a dark box, with a button that copies it. */
export function CodeBlock({ title, code }: { title: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-code-border bg-code text-code-foreground shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b border-code-border py-1.5 pr-1.5 pl-4">
        <span className="truncate font-mono text-xs text-code-muted">{title}</span>
        <CopyButton
          text={code}
          label="example"
          variant="ghost"
          size="icon-sm"
          className="text-code-muted hover:bg-code-foreground/10 hover:text-code-foreground dark:hover:bg-code-foreground/10"
        />
      </div>
      <pre className="overflow-x-auto p-4 font-mono text-[0.8125rem] leading-6">{code}</pre>
    </div>
  );
}

/** A short aside. "warning" is for things that can't be undone. */
export function Note({
  kind = "info",
  title,
  children,
}: {
  kind?: "info" | "warning";
  title: string;
  children: ReactNode;
}) {
  const Icon = kind === "warning" ? TriangleAlert : Info;
  return (
    <aside
      className={cn(
        "flex gap-3 rounded-lg border px-4 py-3.5 text-sm leading-6",
        kind === "warning" ? "border-warning/40 bg-warning/8" : "bg-muted/50",
      )}
    >
      <Icon
        className={cn(
          "mt-1 size-4 shrink-0",
          kind === "warning" ? "text-warning" : "text-muted-foreground",
        )}
        aria-hidden
      />
      <div>
        <p className="font-medium">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
    </aside>
  );
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

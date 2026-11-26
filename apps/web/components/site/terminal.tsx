import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * One line of a pretend terminal session. The text copies what the real CLI
 * prints (apps/cli/src), so the page shows the tool as it is.
 */
export type TerminalLine =
  | { kind: "command"; text: string }
  | { kind: "success"; text: string }
  | { kind: "info"; text: string }
  | { kind: "comment"; text: string }
  | { kind: "diff"; added?: string[]; changed?: string[]; removed?: string[] }
  /** A question from the CLI and the answer given, as the prompt shows them once answered. */
  | { kind: "answered"; question: string; answer: string }
  | { kind: "blank" };

/** A dark terminal window with a title bar. Stays dark in both themes. */
export function TerminalWindow({
  title,
  label,
  lines,
  className,
}: {
  title: string;
  /** Short text on the right of the title bar, such as "Your laptop". */
  label?: string;
  lines: TerminalLine[];
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border border-code-border bg-code text-code-foreground shadow-[0_1px_0_0_oklch(1_0_0/0.06)_inset,0_12px_32px_-12px_oklch(0_0_0/0.35)]",
        className,
      )}
    >
      <figcaption className="flex items-center justify-between gap-3 border-b border-code-border px-4 py-2.5 font-mono text-xs text-code-muted">
        <span className="truncate">{title}</span>
        {label === undefined ? null : <span className="shrink-0">{label}</span>}
      </figcaption>
      <pre className="px-4 py-4 font-mono text-[0.8125rem] leading-6">
        {lines.map((line, index) => (
          <TerminalRow key={index} line={line} />
        ))}
      </pre>
    </figure>
  );
}

function TerminalRow({ line }: { line: TerminalLine }) {
  switch (line.kind) {
    case "command":
      return (
        <Row>
          <span className="text-code-muted select-none">$ </span>
          {line.text}
        </Row>
      );
    case "success":
      return (
        <Row>
          <Check className="mr-2 inline size-3.5 align-[-2px] text-success" aria-hidden />
          <span className="text-code-foreground/85">{line.text}</span>
        </Row>
      );
    case "info":
      return (
        <Row>
          <span className="text-code-foreground/75">{line.text}</span>
        </Row>
      );
    case "comment":
      return (
        <Row>
          <span className="text-code-muted"># {line.text}</span>
        </Row>
      );
    case "diff":
      return <DiffRow added={line.added} changed={line.changed} removed={line.removed} />;
    case "answered":
      return (
        <>
          <Row>
            <span className="text-success">◇ </span>
            <span className="text-code-foreground/85">{line.question}</span>
          </Row>
          <Row>
            <span className="text-code-muted">│ {line.answer}</span>
          </Row>
        </>
      );
    default:
      // "blank": an empty line.
      return <Row>{""}</Row>;
  }
}

function DiffRow({
  added = [],
  changed = [],
  removed = [],
}: {
  added?: string[] | undefined;
  changed?: string[] | undefined;
  removed?: string[] | undefined;
}) {
  // Same marks as `formatDiff` in the CLI: key names only, never values.
  return (
    <Row>
      {added.map((key) => (
        <span key={`+${key}`} className="mr-3 text-success">
          + {key}
        </span>
      ))}
      {changed.map((key) => (
        <span key={`~${key}`} className="mr-3 text-warning">
          ~ {key}
        </span>
      ))}
      {removed.map((key) => (
        <span key={`-${key}`} className="mr-3 text-destructive">
          − {key}
        </span>
      ))}
    </Row>
  );
}

function Row({ children }: { children: ReactNode }) {
  return (
    <span className="block min-h-6 whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</span>
  );
}

"use client";

import { AlertCircle, Copy, Eye, EyeOff, Trash2 } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rowProblem, rowStatus, type Row } from "@/lib/env-rows";
import { cn } from "@/lib/utils";

const GRID = "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto]";

export type RowHandlers = {
  update: (id: number, change: Partial<Row>) => void;
  remove: (row: Row) => void;
  pasteInto: (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    row: Row,
    field: "key" | "value",
  ) => void;
  addAfterLast: () => void;
};

/** The variables as editable name / value rows. */
export function EnvTable({
  rows,
  visibleRows,
  saved,
  canEdit,
  handlers,
}: {
  rows: Row[];
  visibleRows: Row[];
  saved: Record<string, string>;
  canEdit: boolean;
  handlers: RowHandlers;
}) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "hidden gap-2 px-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase sm:grid",
          GRID,
        )}
      >
        <span>Name</span>
        <span>Value</span>
        <span className="w-[6.75rem]" />
      </div>
      <ul className="space-y-2">
        {visibleRows.map((row) => (
          <EnvRow
            key={row.id}
            row={row}
            isLast={row.id === rows.at(-1)?.id}
            status={rowStatus(saved, row)}
            problem={rowProblem(row, rows)}
            canEdit={canEdit}
            handlers={handlers}
          />
        ))}
      </ul>
    </div>
  );
}

function EnvRow({
  row,
  isLast,
  status,
  problem,
  canEdit,
  handlers,
}: {
  row: Row;
  isLast: boolean;
  status: "new" | "edited" | undefined;
  problem: string | undefined;
  canEdit: boolean;
  handlers: RowHandlers;
}) {
  const label = row.key || "new variable";
  const lineCount = row.value.split("\n").length;

  function onValueKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // Enter on the last value starts a new row, so typing a list feels quick.
    if (event.key === "Enter" && isLast && canEdit) {
      event.preventDefault();
      handlers.addAfterLast();
    }
  }

  return (
    <li
      className={cn(
        "rounded-lg border p-2 sm:border-0 sm:p-0",
        status === "new" && "border-l-2 border-l-emerald-500 sm:border-l-0",
        status === "edited" && "border-l-2 border-l-amber-500 sm:border-l-0",
      )}
    >
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2", GRID)}>
        <div className="relative col-span-2 sm:col-span-1">
          <Input
            aria-label="Variable name"
            aria-invalid={problem !== undefined}
            className={cn("font-mono text-[13px]", status !== undefined && "pr-16")}
            placeholder="VARIABLE_NAME"
            value={row.key}
            readOnly={!canEdit}
            spellCheck={false}
            autoComplete="off"
            onPaste={canEdit ? (event) => handlers.pasteInto(event, row, "key") : undefined}
            onChange={(event) => handlers.update(row.id, { key: event.target.value })}
            onBlur={() => {
              const trimmed = row.key.trim();
              if (trimmed !== row.key) {
                handlers.update(row.id, { key: trimmed });
              }
            }}
          />
          {status === undefined ? null : (
            <Badge
              variant="outline"
              className={cn(
                "pointer-events-none absolute top-1/2 right-2 -translate-y-1/2",
                status === "new"
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "border-amber-500/30 text-amber-700 dark:text-amber-300",
              )}
            >
              {status}
            </Badge>
          )}
        </div>
        <ValueField
          row={row}
          label={label}
          lineCount={lineCount}
          canEdit={canEdit}
          handlers={handlers}
          onKeyDown={onValueKeyDown}
        />
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={row.revealed ? `Hide ${label}` : `Show ${label}`}
            aria-pressed={row.revealed}
            onClick={() => handlers.update(row.id, { revealed: !row.revealed })}
          >
            {row.revealed ? <EyeOff /> : <Eye />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground"
            aria-label={`Copy ${label}`}
            onClick={() => {
              void navigator.clipboard
                .writeText(row.value)
                .then(() => toast.success(`Copied ${label}`));
            }}
          >
            <Copy />
          </Button>
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              aria-label={`Remove ${label}`}
              onClick={() => handlers.remove(row)}
            >
              <Trash2 />
            </Button>
          ) : null}
        </div>
      </div>
      {problem === undefined ? null : (
        <p className="mt-1 flex items-center gap-1 px-1 text-xs text-destructive">
          <AlertCircle className="size-3" /> {problem}
        </p>
      )}
    </li>
  );
}

function ValueField({
  row,
  label,
  lineCount,
  canEdit,
  handlers,
  onKeyDown,
}: {
  row: Row;
  label: string;
  lineCount: number;
  canEdit: boolean;
  handlers: RowHandlers;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const valueLabel = `Value of ${label}`;
  if (lineCount > 1 && !row.revealed) {
    return (
      <button
        type="button"
        aria-label={valueLabel}
        onClick={() => handlers.update(row.id, { revealed: true })}
        className="flex h-8 items-center gap-2 rounded-lg border bg-muted/40 px-2.5 text-left font-mono text-[13px] text-muted-foreground hover:text-foreground"
      >
        •••••• <span className="font-sans text-xs">{lineCount} lines, click to show</span>
      </button>
    );
  }
  if (lineCount > 1) {
    return (
      <Textarea
        aria-label={valueLabel}
        className="min-h-8 font-mono text-[13px]"
        rows={Math.min(8, lineCount)}
        value={row.value}
        readOnly={!canEdit}
        spellCheck={false}
        onPaste={canEdit ? (event) => handlers.pasteInto(event, row, "value") : undefined}
        onChange={(event) => handlers.update(row.id, { value: event.target.value })}
      />
    );
  }
  return (
    <Input
      aria-label={valueLabel}
      className="font-mono text-[13px]"
      type={row.revealed ? "text" : "password"}
      placeholder="value"
      autoComplete="off"
      spellCheck={false}
      value={row.value}
      readOnly={!canEdit}
      onKeyDown={onKeyDown}
      onPaste={canEdit ? (event) => handlers.pasteInto(event, row, "value") : undefined}
      onChange={(event) => handlers.update(row.id, { value: event.target.value })}
    />
  );
}

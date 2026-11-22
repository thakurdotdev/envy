"use client";

import { AlertCircle, Eye, EyeOff, Trash2 } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { rowProblem, rowStatus, type Row } from "@/lib/env-rows";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { StatusBadge } from "./status-badge";

const GRID = "sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_6rem]";

// Inputs inside the table look like plain cells until hovered or focused.
const CELL_INPUT =
  "border-transparent bg-transparent font-mono text-sm shadow-none hover:border-input focus-visible:bg-background dark:bg-transparent read-only:hover:border-transparent";

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
  focusRowId,
  handlers,
}: {
  rows: Row[];
  visibleRows: Row[];
  saved: Record<string, string>;
  canEdit: boolean;
  focusRowId?: number | undefined;
  handlers: RowHandlers;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card shadow-xs">
      <div
        className={cn(
          "hidden gap-2 border-b border-l-2 border-l-transparent bg-muted/40 py-2 pr-2 pl-3 text-xs font-medium text-muted-foreground sm:grid",
          GRID,
        )}
      >
        <span className="px-2.5">Name</span>
        <span className="px-2.5">Value</span>
        <span className="sr-only">Actions</span>
      </div>
      <ul className="divide-y">
        {visibleRows.map((row) => (
          <EnvRow
            key={row.id}
            row={row}
            isLast={row.id === rows.at(-1)?.id}
            status={rowStatus(saved, row)}
            problem={rowProblem(row, rows)}
            canEdit={canEdit}
            autoFocus={row.id === focusRowId}
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
  autoFocus,
  handlers,
}: {
  row: Row;
  isLast: boolean;
  status: "new" | "edited" | undefined;
  problem: string | undefined;
  canEdit: boolean;
  autoFocus: boolean;
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
        "border-l-2 py-2 pr-2 pl-2 transition-colors hover:bg-muted/30 sm:py-1.5 sm:pl-3",
        status === "new" && "border-l-success",
        status === "edited" && "border-l-warning",
        status === undefined && "border-l-transparent",
      )}
    >
      <div className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2", GRID)}>
        <div className="relative col-span-2 sm:col-span-1">
          <Input
            aria-label="Variable name"
            aria-invalid={problem !== undefined}
            className={cn(CELL_INPUT, "font-medium", status !== undefined && "pr-20")}
            placeholder="VARIABLE_NAME"
            // oxlint-disable-next-line jsx-a11y/no-autofocus -- the user just pressed "Add"
            autoFocus={autoFocus}
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
            <StatusBadge
              tone={status === "new" ? "success" : "warning"}
              className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 bg-card"
            >
              {status}
            </StatusBadge>
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
        <div className="flex justify-end">
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
          <CopyButton
            text={row.value}
            label={label}
            variant="ghost"
            className="text-muted-foreground"
          />
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
        <p className="mt-1 flex items-center gap-1 px-2.5 text-xs text-destructive">
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
        className="flex h-8 items-center gap-2 rounded-lg border border-dashed px-2.5 text-left font-mono text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        •••••• <span className="font-sans text-xs">{lineCount} lines, click to show</span>
      </button>
    );
  }
  if (lineCount > 1) {
    return (
      <Textarea
        aria-label={valueLabel}
        className="min-h-8 font-mono text-sm"
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
      className={CELL_INPUT}
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

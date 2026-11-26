"use client";

import { serializeDotenv } from "@envy/shared";
import { KeyRound, Plus, Search, Undo2, Upload } from "lucide-react";
import { useEffect, useState, type ClipboardEvent, type DragEvent } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLoad } from "@/hooks/use-load";
import { ApiError, errorMessage } from "@/lib/api";
import {
  describeImport,
  looksLikeEnv,
  mergeImport,
  newRow,
  readEnvText,
  rowProblem,
  rowsFromVariables,
  toRows,
  toSecrets,
  type Row,
} from "@/lib/env-rows";
import { diffKeys, pullEnvironment, pushEnvironment, type EnvironmentSummary } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { cn } from "@/lib/utils";
import { EnvTable, type RowHandlers } from "./env-table";
import { EnvToolbar, type EditorMode } from "./env-toolbar";
import { InheritedVariables } from "./inherited-variables";
import { RawEnvView } from "./raw-env-view";
import { SaveDialog } from "./save-dialog";
import { EmptyState, LoadError, LoadingRows } from "./states";

const MAX_FILE_BYTES = 256 * 1024;

/** Edit one environment's variables. Values stay hidden until revealed. */
export function SecretEditor({
  projectId,
  environment,
  canEdit,
  isActive,
  onSaved,
  onDirtyChange,
  layers = [],
}: {
  projectId: string;
  environment: EnvironmentSummary;
  /** The environments under this one, lowest first, shown read only below the table. */
  layers?: EnvironmentSummary[];
  canEdit: boolean;
  /** Only the visible editor answers the save shortcut. */
  isActive: boolean;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { keys } = useUnlocked();
  const { state, reload } = useLoad(
    () => pullEnvironment(keys, projectId, environment),
    [environment.id],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [mode, setMode] = useState<EditorMode>("table");
  const [rawText, setRawText] = useState("");
  const [rawError, setRawError] = useState<string | undefined>();
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  // A row just added with "Add": its name box gets the focus.
  const [focusRowId, setFocusRowId] = useState<number | undefined>();

  // Reset the rows only when new data arrives, not when a refresh starts.
  const loaded = state.status === "ready" ? state.data : undefined;
  useEffect(() => {
    if (loaded !== undefined) {
      setRows(toRows(loaded.secrets));
      setConflict(undefined);
    }
  }, [loaded]);

  const saved = loaded?.secrets ?? {};
  const edited = toSecrets(rows);
  const diff = diffKeys(saved, edited);
  const isDirty =
    loaded !== undefined && diff.added.length + diff.changed.length + diff.removed.length > 0;
  const count = Object.keys(edited).length;
  const problem =
    mode === "env" ? rawError : rows.map((row) => rowProblem(row, rows)).find(Boolean);
  const canSave = canEdit && isDirty && problem === undefined && !saving;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  // Ctrl+S / Cmd+S opens the save check, like saving a file.
  useEffect(() => {
    if (!isActive || !canEdit) {
      return undefined;
    }
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (canSave) {
          setConfirming(true);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isActive, canEdit, canSave]);

  if (state.status === "loading") {
    return <LoadingRows label={`Loading ${environment.name}`} />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const allRevealed = rows.length > 0 && rows.every((row) => row.revealed);
  const search = query.trim().toLowerCase();
  const visibleRows =
    search === ""
      ? rows
      : rows.filter((row) => row.key === "" || row.key.toLowerCase().includes(search));

  function update(id: number, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  function addRow() {
    const row = newRow("", "", true);
    setQuery("");
    setMode("table");
    setRows((current) => [...current, row]);
    setFocusRowId(row.id);
  }

  function remove(row: Row) {
    const index = rows.findIndex((candidate) => candidate.id === row.id);
    setRows((current) => current.filter((candidate) => candidate.id !== row.id));
    if (row.key !== "" || row.value !== "") {
      toast(`Removed ${row.key || "a variable"}`, {
        action: {
          label: "Undo",
          onClick: () =>
            setRows((current) => [...current.slice(0, index), row, ...current.slice(index)]),
        },
      });
    }
  }

  function importVariables(variables: Record<string, string>, base: Row[], source: string) {
    const { added, changed } = describeImport(base, variables, false);
    setRows(mergeImport(base, variables, false));
    const summary = [
      added.length > 0 ? `${added.length} new` : "",
      changed.length > 0 ? `${changed.length} changed` : "",
    ].filter((part) => part !== "");
    toast.success(`Imported from ${source}`, {
      description: summary.length === 0 ? "Everything already matched." : summary.join(", "),
    });
  }

  function importText(text: string, source: string) {
    const parsed = readEnvText(text);
    if (parsed.status === "ok") {
      setMode("table");
      importVariables(parsed.variables, rows, source);
    } else {
      toast.error(parsed.status === "error" ? parsed.message : `No variables found in ${source}.`);
    }
  }

  async function importFile(file: File) {
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too big for a .env file.");
      return;
    }
    importText(await file.text(), file.name);
  }

  // Pasting a whole .env into any field splits it into rows.
  function pasteInto(
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    row: Row,
    field: "key" | "value",
  ) {
    const text = event.clipboardData.getData("text");
    const isMultiLine = /[\r\n]/.test(text);
    const isEnv = looksLikeEnv(text) && (field === "key" || isMultiLine);
    const parsed = isEnv ? readEnvText(text) : undefined;
    if (parsed?.status === "ok") {
      event.preventDefault();
      // Pasting into an empty row replaces it instead of leaving a blank row.
      const isEmptyRow = row.key === "" && row.value === "";
      const base = isEmptyRow ? rows.filter((candidate) => candidate.id !== row.id) : rows;
      importVariables(parsed.variables, base, "the clipboard");
    } else if (field === "value" && isMultiLine) {
      // A certificate or key: keep the line breaks instead of losing them.
      event.preventDefault();
      const target = event.currentTarget;
      const start = target.selectionStart ?? row.value.length;
      const end = target.selectionEnd ?? row.value.length;
      const pasted = text.replaceAll("\r\n", "\n");
      update(row.id, {
        value: row.value.slice(0, start) + pasted + row.value.slice(end),
        revealed: true,
      });
    }
  }

  function changeMode(next: EditorMode) {
    if (next === "env") {
      setRawText(serializeDotenv(edited));
      setRawError(undefined);
    }
    setMode(next);
  }

  function changeRawText(text: string) {
    setRawText(text);
    const parsed = readEnvText(text);
    if (parsed.status === "error") {
      setRawError(parsed.message);
      return;
    }
    setRawError(undefined);
    setRows((current) =>
      parsed.status === "ok" ? rowsFromVariables(current, parsed.variables) : [],
    );
  }

  function onDrop(event: DragEvent) {
    const file = event.dataTransfer.files[0];
    setDragging(false);
    if (file !== undefined && canEdit) {
      event.preventDefault();
      void importFile(file);
    }
  }

  async function save(message: string | undefined) {
    setSaving(true);
    try {
      const version = await pushEnvironment({
        keys,
        projectId,
        environment,
        secrets: edited,
        baseVersion: loaded?.version ?? 0,
        ...(message === undefined ? {} : { message }),
      });
      toast.success(`Saved version ${version} of ${environment.name}`);
      onSaved();
    } catch (error) {
      if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
        setConflict(
          `Someone saved version ${error.details["latestVersion"] ?? "?"} while you were editing.`,
        );
      } else {
        toast.error(errorMessage(error));
      }
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  const handlers: RowHandlers = { update, remove, pasteInto, addAfterLast: addRow };

  return (
    <div
      className="relative space-y-3"
      onDragOver={(event) => {
        if (canEdit && event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!(
          event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
        )) {
          setDragging(false);
        }
      }}
      onDrop={onDrop}
    >
      {conflict === undefined ? null : (
        <Alert variant="destructive">
          <AlertDescription>
            {conflict} Reload to see it; your unsaved edits will be lost.
            <Button variant="outline" size="sm" className="ml-3" onClick={reload}>
              Reload
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {environment.isShared ? (
        <p className="text-sm text-muted-foreground">
          Every environment gets these{environment.appId === null ? ", in every app" : ""}. A
          variable set in an environment with the same name wins.
        </p>
      ) : null}
      <EnvToolbar
        mode={mode}
        onModeChange={changeMode}
        count={count}
        canEdit={canEdit}
        allRevealed={allRevealed}
        onRevealAll={() =>
          setRows((current) => current.map((row) => ({ ...row, revealed: !allRevealed })))
        }
        onCopyAll={() => {
          void navigator.clipboard
            .writeText(serializeDotenv(edited))
            .then(() => toast.success(`Copied ${count} variables as .env`));
        }}
        onImportFile={(file) => void importFile(file)}
        onAdd={addRow}
      />

      {mode === "env" ? (
        <RawEnvView text={rawText} error={rawError} canEdit={canEdit} onChange={changeRawText} />
      ) : rows.length === 0 && !canEdit ? (
        <EmptyState title={`${environment.name} has no variables yet`} />
      ) : rows.length === 0 ? (
        <button
          type="button"
          onClick={addRow}
          onPaste={(event) => {
            const text = event.clipboardData.getData("text");
            if (text.trim() !== "") {
              event.preventDefault();
              importText(text, "the clipboard");
            }
          }}
          className="flex w-full flex-col items-center rounded-lg border border-dashed bg-card/50 px-4 py-12 text-center transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs">
            <KeyRound className="size-5" />
          </span>
          <span className="mt-3 text-sm font-medium">{environment.name} has no variables yet</span>
          <span className="mt-1 max-w-sm text-sm text-muted-foreground">
            Add one, paste a whole .env file into any field, or drop a .env file here.
          </span>
          <span className="mt-5 inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium shadow-xs">
            <Plus className="size-4" /> Add variable
          </span>
        </button>
      ) : (
        <>
          {rows.length > 6 ? (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Filter variables by name"
                placeholder="Filter by name"
                className="pl-8"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
          ) : null}
          <EnvTable
            rows={rows}
            visibleRows={visibleRows}
            saved={saved}
            canEdit={canEdit}
            focusRowId={focusRowId}
            handlers={handlers}
          />
          {search !== "" && visibleRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No variables match &quot;{query}&quot;.
            </p>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              onClick={addRow}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-2.5 text-sm text-muted-foreground transition-colors hover:border-input hover:bg-muted/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Plus className="size-4" /> Add another
              <span className="hidden text-muted-foreground/80 sm:inline">
                or paste a .env file into any field
              </span>
            </button>
          ) : null}
        </>
      )}

      {mode === "table" ? (
        <InheritedVariables projectId={projectId} layers={layers} ownKeys={Object.keys(edited)} />
      ) : null}

      {canEdit && diff.removed.length > 0 ? (
        <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm">
          <p className="mb-2 font-medium text-destructive">
            Removed when you save ({diff.removed.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {diff.removed.map((key) => (
              <button
                key={key}
                type="button"
                title="Put it back"
                onClick={() => setRows((current) => [...current, newRow(key, saved[key] ?? "")])}
                className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 font-mono text-xs line-through decoration-destructive/60 hover:no-underline"
              >
                {key} <Undo2 className="size-3" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {canEdit && (rows.length > 0 || isDirty) ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
            // While there is something to save, the bar stays in view on long lists.
            isDirty
              ? "sticky bottom-3 z-10 bg-card/95 shadow-md backdrop-blur"
              : "border-transparent px-1",
          )}
        >
          <span
            className={cn(
              "flex items-center gap-1.5 text-sm",
              isDirty ? "font-medium text-foreground" : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {isDirty && problem === undefined ? (
              <span className="size-2 rounded-full bg-brand" aria-hidden />
            ) : null}
            {mode === "env" && rawError !== undefined
              ? "Fix the .env text above to save."
              : (problem ?? (isDirty ? describeChanges(diff) : "All changes saved"))}
          </span>
          <Button
            variant="ghost"
            className="ml-auto"
            disabled={!isDirty}
            onClick={() => {
              setRows(toRows(saved));
              setMode("table");
            }}
          >
            Discard
          </Button>
          <Button disabled={!canSave} onClick={() => setConfirming(true)} title="Save (Ctrl+S)">
            Save
          </Button>
        </div>
      ) : null}

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-ring bg-background/85 backdrop-blur-sm">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Upload className="size-4" /> Drop to import variables
          </span>
        </div>
      ) : null}

      <SaveDialog
        open={confirming}
        onOpenChange={setConfirming}
        environment={environment}
        diff={diff}
        saving={saving}
        onSave={(message) => void save(message)}
      />
    </div>
  );
}

function describeChanges(diff: { added: string[]; changed: string[]; removed: string[] }): string {
  const parts = [
    diff.added.length > 0 ? `${diff.added.length} added` : "",
    diff.changed.length > 0 ? `${diff.changed.length} changed` : "",
    diff.removed.length > 0 ? `${diff.removed.length} removed` : "",
  ].filter((part) => part !== "");
  return `Unsaved: ${parts.join(", ")}`;
}

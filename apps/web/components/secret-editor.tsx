"use client";

import { Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoad } from "@/hooks/use-load";
import { ApiError, errorMessage } from "@/lib/api";
import { diffKeys, pullEnvironment, pushEnvironment, type EnvironmentSummary } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { EmptyState, LoadError, LoadingRows } from "./states";

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/;

type Row = { id: number; key: string; value: string; revealed: boolean };
let nextRowId = 1;

function toRows(secrets: Record<string, string>): Row[] {
  return Object.entries(secrets).map(([key, value]) => ({
    id: nextRowId++,
    key,
    value,
    revealed: false,
  }));
}

function toSecrets(rows: Row[]): Record<string, string> {
  return Object.fromEntries(
    rows.filter((row) => row.key !== "").map((row) => [row.key, row.value]),
  );
}

/** Edit one environment's variables. Values stay hidden until revealed. */
export function SecretEditor({
  projectId,
  environment,
  canEdit,
  onSaved,
}: {
  projectId: string;
  environment: EnvironmentSummary;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { keys } = useUnlocked();
  const { state, reload } = useLoad(
    () => pullEnvironment(keys, projectId, environment.id),
    [environment.id],
  );
  const [rows, setRows] = useState<Row[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (state.status === "ready") {
      setRows(toRows(state.data.secrets));
      setConflict(undefined);
    }
  }, [state]);

  if (state.status === "loading") {
    return <LoadingRows label={`Loading ${environment.name}`} />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }

  const saved = state.data.secrets;
  const edited = toSecrets(rows);
  const diff = diffKeys(saved, edited);
  const isDirty = diff.added.length + diff.changed.length + diff.removed.length > 0;
  const keyNames = rows.map((row) => row.key).filter((key) => key !== "");
  const problem = rows.some((row) => row.key !== "" && !KEY_PATTERN.test(row.key))
    ? "Names may use letters, digits and _ (and must not start with a digit)."
    : new Set(keyNames).size !== keyNames.length
      ? "Two variables have the same name."
      : undefined;

  function update(id: number, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  async function save() {
    setSaving(true);
    try {
      const version = await pushEnvironment({
        keys,
        projectId,
        environment,
        secrets: edited,
        baseVersion: state.status === "ready" ? state.data.version : 0,
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

  return (
    <div className="space-y-4">
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
      {rows.length === 0 && !canEdit ? (
        <EmptyState title={`${environment.name} has no variables yet`} />
      ) : null}
      {rows.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-1/3">Name</TableHead>
              <TableHead>Value</TableHead>
              <TableHead className="w-32 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <Input
                    aria-label="Variable name"
                    className="font-mono"
                    value={row.key}
                    readOnly={!canEdit}
                    onChange={(event) => update(row.id, { key: event.target.value })}
                  />
                </TableCell>
                <TableCell>
                  <Input
                    aria-label={`Value of ${row.key || "new variable"}`}
                    className="font-mono"
                    type={row.revealed ? "text" : "password"}
                    autoComplete="off"
                    value={row.value}
                    readOnly={!canEdit}
                    onChange={(event) => update(row.id, { value: event.target.value })}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={row.revealed ? `Hide ${row.key}` : `Show ${row.key}`}
                    aria-pressed={row.revealed}
                    onClick={() => update(row.id, { revealed: !row.revealed })}
                  >
                    {row.revealed ? <EyeOff /> : <Eye />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Copy ${row.key}`}
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(row.value)
                        .then(() => toast.success(`Copied ${row.key}`));
                    }}
                  >
                    <Copy />
                  </Button>
                  {canEdit ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${row.key}`}
                      onClick={() =>
                        setRows((current) => current.filter((candidate) => candidate.id !== row.id))
                      }
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              setRows((current) => [
                ...current,
                { id: nextRowId++, key: "", value: "", revealed: true },
              ])
            }
          >
            <Plus /> Add variable
          </Button>
          <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
            {problem ?? (isDirty ? "Unsaved changes" : "")}
          </span>
          <Button variant="ghost" disabled={!isDirty} onClick={() => setRows(toRows(saved))}>
            Discard
          </Button>
          <Button
            disabled={!isDirty || problem !== undefined || saving}
            onClick={() => setConfirming(true)}
          >
            Save
          </Button>
        </div>
      ) : null}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save to {environment.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {environment.isProtected ? (
                  <p className="font-medium text-destructive">
                    {environment.name} is a protected environment.
                  </p>
                ) : null}
                <p className="font-mono text-sm">
                  {[
                    ...diff.added.map((key) => `+ ${key}`),
                    ...diff.changed.map((key) => `~ ${key}`),
                    ...diff.removed.map((key) => `− ${key}`),
                  ].join("  ")}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>Save new version</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

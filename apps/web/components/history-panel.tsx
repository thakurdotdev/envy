"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useLoad } from "@/hooks/use-load";
import { ApiError, call, errorMessage } from "@/lib/api";
import { diffKeys, pullEnvironment, pushEnvironment, type EnvironmentSummary } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { DiffLine, diffLines } from "./diff-line";
import { EmptyState, LoadError, LoadingRows } from "./states";
import { StatusBadge } from "./status-badge";
import { TableFrame } from "./table-frame";
import { TimeAgo } from "./time-ago";

type Comparison = {
  version: number;
  diff: { added: string[]; changed: string[]; removed: string[] };
  secrets: Record<string, string>;
  baseVersion: number;
};

/** Versions of one environment, a keys-only diff against the current one, and rollback. */
export function HistoryPanel({
  projectId,
  environment,
  canEdit,
  onChanged,
  revision,
}: {
  revision: number;
  projectId: string;
  environment: EnvironmentSummary;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { keys } = useUnlocked();
  const { state, reload } = useLoad(
    () =>
      call((api) =>
        api.v1.environments({ id: environment.id }).versions.get({ query: { limit: 50 } }),
      ),
    [environment.id, revision],
  );
  const [comparison, setComparison] = useState<Comparison | undefined>();
  const [comparing, setComparing] = useState<number | undefined>();
  const [confirming, setConfirming] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);

  async function compare(version: number) {
    setComparing(version);
    try {
      const [old, current] = await Promise.all([
        pullEnvironment(keys, projectId, environment, version),
        pullEnvironment(keys, projectId, environment),
      ]);
      setComparison({
        version,
        diff: diffKeys(current.secrets, old.secrets),
        secrets: old.secrets,
        baseVersion: current.version,
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.code === "KEY_NOT_FOUND"
          ? "That version uses a key from before you joined, so it cannot be opened here."
          : errorMessage(error),
      );
    } finally {
      setComparing(undefined);
    }
  }

  async function rollBack(target: Comparison) {
    setRollingBack(true);
    try {
      const version = await pushEnvironment({
        keys,
        projectId,
        environment,
        secrets: target.secrets,
        baseVersion: target.baseVersion,
        message: `Rollback to version ${target.version}`,
      });
      toast.success(`Rolled back to version ${target.version} (saved as version ${version})`);
      setComparison(undefined);
      setConfirming(false);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setRollingBack(false);
    }
  }

  if (state.status === "loading") {
    return <LoadingRows label="Loading history" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  if (state.data.items.length === 0) {
    return <EmptyState title="No versions yet">The first save becomes version 1.</EmptyState>;
  }
  const latest = state.data.items[0]?.version;
  return (
    <div className="space-y-4">
      <TableFrame>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Version</TableHead>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Note</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.data.items.map((item) => (
              <TableRow
                key={item.version}
                data-state={comparison?.version === item.version ? "selected" : undefined}
              >
                <TableCell className="font-mono text-sm">
                  v{item.version}
                  {item.version === latest ? (
                    <StatusBadge tone="success" className="ml-2 font-sans">
                      current
                    </StatusBadge>
                  ) : null}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <TimeAgo value={item.createdAt} />
                </TableCell>
                <TableCell>@{item.author.githubLogin}</TableCell>
                <TableCell
                  className="max-w-64 truncate text-muted-foreground"
                  title={item.message ?? undefined}
                >
                  {item.message ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  {item.version === latest ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={comparing !== undefined}
                      onClick={() => void compare(item.version)}
                    >
                      {comparing === item.version ? <Spinner /> : null}
                      Compare
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableFrame>
      {comparison === undefined ? null : (
        <div className="rounded-lg border bg-card p-4 shadow-xs" aria-live="polite">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-medium">
              Going back to version {comparison.version} would change:
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close the comparison"
              onClick={() => setComparison(undefined)}
            >
              <X />
            </Button>
          </div>
          <DiffList diff={comparison.diff} />
          {canEdit ? (
            <Button className="mt-3" size="sm" onClick={() => setConfirming(true)}>
              Roll back to version {comparison.version}
            </Button>
          ) : null}
        </div>
      )}
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => (rollingBack ? undefined : setConfirming(open))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back {environment.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Version {comparison?.version} is saved again as a new version. Nothing is deleted, so
              you can roll forward the same way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rollingBack}>Cancel</AlertDialogCancel>
            <Button
              disabled={rollingBack}
              onClick={() => (comparison === undefined ? undefined : void rollBack(comparison))}
            >
              {rollingBack ? <Spinner /> : null}
              Roll back
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DiffList({ diff }: { diff: Comparison["diff"] }) {
  const lines = diffLines(diff);
  if (lines.length === 0) {
    return <p className="mt-2 text-sm text-muted-foreground">Nothing: it is the same as now.</p>;
  }
  return (
    <ul aria-label="Changes" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-sm">
      {lines.map((line) => (
        <DiffLine key={line.key} name={line.key} kind={line.kind} />
      ))}
    </ul>
  );
}

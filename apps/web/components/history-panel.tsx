"use client";

import { useState } from "react";
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
import { Button } from "@/components/ui/button";
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
import {
  diffKeys,
  formatDate,
  pullEnvironment,
  pushEnvironment,
  type EnvironmentSummary,
} from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { EmptyState, LoadError, LoadingRows } from "./states";

type Comparison = {
  version: number;
  summary: string;
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
  const [rollingBack, setRollingBack] = useState(false);

  async function compare(version: number) {
    try {
      const [old, current] = await Promise.all([
        pullEnvironment(keys, projectId, environment.id, version),
        pullEnvironment(keys, projectId, environment.id),
      ]);
      const diff = diffKeys(current.secrets, old.secrets);
      const parts = [
        ...diff.added.map((key) => `+ ${key}`),
        ...diff.changed.map((key) => `~ ${key}`),
        ...diff.removed.map((key) => `− ${key}`),
      ];
      setComparison({
        version,
        summary: parts.length === 0 ? "Same as the current version." : parts.join("  "),
        secrets: old.secrets,
        baseVersion: current.version,
      });
    } catch (error) {
      toast.error(
        error instanceof ApiError && error.code === "KEY_NOT_FOUND"
          ? "That version uses a key from before you joined, so it cannot be opened here."
          : errorMessage(error),
      );
    }
  }

  async function rollBack(target: Comparison) {
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
    return <EmptyState title="No versions yet" />;
  }
  return (
    <div className="space-y-4">
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
            <TableRow key={item.version}>
              <TableCell>v{item.version}</TableCell>
              <TableCell>{formatDate(item.createdAt)}</TableCell>
              <TableCell>@{item.author.githubLogin}</TableCell>
              <TableCell className="text-muted-foreground">{item.message ?? ""}</TableCell>
              <TableCell className="text-right">
                <Button variant="outline" size="sm" onClick={() => void compare(item.version)}>
                  Compare
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {comparison === undefined ? null : (
        <div className="rounded-lg border p-4" aria-live="polite">
          <p className="text-sm font-medium">
            Going back to version {comparison.version} would change:
          </p>
          <p className="mt-2 font-mono text-sm">{comparison.summary}</p>
          {canEdit ? (
            <Button className="mt-3" size="sm" onClick={() => setRollingBack(true)}>
              Roll back to version {comparison.version}
            </Button>
          ) : null}
        </div>
      )}
      <AlertDialog open={rollingBack} onOpenChange={setRollingBack}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Roll back {environment.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Version {comparison?.version} is saved again as a new version. Nothing is deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => (comparison === undefined ? undefined : void rollBack(comparison))}
            >
              Roll back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

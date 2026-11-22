"use client";

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
import type { EnvironmentSummary } from "@/lib/envy";

/** Shows which names a save adds, changes and removes, before it happens. */
export function SaveDialog({
  open,
  onOpenChange,
  environment,
  diff,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: EnvironmentSummary;
  diff: { added: string[]; changed: string[]; removed: string[] };
  onSave: () => void;
}) {
  const lines = [
    ...diff.added.map((key) => ({
      key,
      mark: "+",
      tone: "text-emerald-600 dark:text-emerald-400",
    })),
    ...diff.changed.map((key) => ({ key, mark: "~", tone: "text-amber-600 dark:text-amber-300" })),
    ...diff.removed.map((key) => ({ key, mark: "−", tone: "text-destructive" })),
  ];
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
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
              <ul className="max-h-60 overflow-y-auto rounded-lg border p-2 font-mono text-[13px]">
                {lines.map((line) => (
                  <li key={line.key} className={line.tone}>
                    {line.mark} {line.key}
                  </li>
                ))}
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onSave}>Save new version</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

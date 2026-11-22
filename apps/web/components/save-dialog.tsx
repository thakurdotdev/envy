"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import type { EnvironmentSummary } from "@/lib/envy";

/**
 * Shows which names a save adds, changes and removes, before it happens.
 * Stays open while saving, so the result is clear, and takes an optional
 * note that shows up in the history.
 */
export function SaveDialog({
  open,
  onOpenChange,
  environment,
  diff,
  saving,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  environment: EnvironmentSummary;
  diff: { added: string[]; changed: string[]; removed: string[] };
  saving: boolean;
  onSave: (message: string | undefined) => void;
}) {
  const [message, setMessage] = useState("");
  const lines = [
    ...diff.added.map((key) => ({
      key,
      mark: "+",
      tone: "text-emerald-600 dark:text-emerald-400",
    })),
    ...diff.changed.map((key) => ({ key, mark: "~", tone: "text-amber-600 dark:text-amber-300" })),
    ...diff.removed.map((key) => ({ key, mark: "−", tone: "text-destructive" })),
  ];
  const note = message.trim();

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-save would hide whether it worked.
        if (!saving) {
          onOpenChange(next);
        }
      }}
    >
      <AlertDialogContent>
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            onSave(note === "" ? undefined : note);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Save to {environment.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {environment.isProtected ? (
                  <p className="flex items-center gap-1.5 font-medium text-destructive">
                    <ShieldAlert className="size-4" /> {environment.name} is a protected
                    environment. Check the changes carefully.
                  </p>
                ) : null}
                <p>
                  {describeCounts(diff)}. Everyone with access gets the new version on their next
                  pull.
                </p>
                <ul
                  aria-label="Changes"
                  className="max-h-60 overflow-y-auto rounded-lg border p-2 font-mono text-[13px]"
                >
                  {lines.map((line) => (
                    <li key={line.key} className={line.tone}>
                      {line.mark} {line.key}
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-message">
              Note <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="save-message"
              placeholder="For example: rotate the Stripe key"
              maxLength={500}
              value={message}
              disabled={saving}
              onChange={(event) => setMessage(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button type="submit" disabled={saving} autoFocus>
              {saving ? <Spinner /> : null}
              {saving ? "Saving…" : "Save new version"}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function describeCounts(diff: { added: string[]; changed: string[]; removed: string[] }): string {
  const parts = [
    diff.added.length > 0 ? `${diff.added.length} added` : "",
    diff.changed.length > 0 ? `${diff.changed.length} changed` : "",
    diff.removed.length > 0 ? `${diff.removed.length} removed` : "",
  ].filter((part) => part !== "");
  return parts.join(", ");
}

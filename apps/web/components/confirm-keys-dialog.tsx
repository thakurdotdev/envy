"use client";

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
import { useSession } from "@/lib/session";

/**
 * Asks before trusting keys this browser has not seen on a project it
 * already knows (ADR 0016). A hacked server could add a fake member or
 * token, so the person checks each fingerprint with its owner first.
 */
export function ConfirmKeysDialog() {
  const { keyConfirmation } = useSession();
  const owners = keyConfirmation?.owners ?? [];
  const isOne = owners.length === 1;

  return (
    <AlertDialog
      open={keyConfirmation !== undefined}
      onOpenChange={(open) => (open ? undefined : keyConfirmation?.answer(false))}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isOne ? "Check a new key" : "Check new keys"}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                This browser has not seen {isOne ? "this key" : "these keys"} before. Ask{" "}
                {isOne ? "its owner" : "each owner"} to read you the fingerprint from envy members
                ls or the members page. Each must be exactly:
              </p>
              <ul className="space-y-2">
                {owners.map((owner) => (
                  <li key={`${owner.kind}:${owner.id}`} className="space-y-1">
                    <p className="text-foreground">{owner.label}</p>
                    <p className="rounded-md bg-code px-3 py-2 text-center font-mono tracking-wider text-code-foreground">
                      {owner.fingerprint}
                    </p>
                  </li>
                ))}
              </ul>
              <p>If one is different, do not continue: someone may have added a fake key.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button onClick={() => keyConfirmation?.answer(true)}>
            {isOne ? "It matches" : "They all match"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

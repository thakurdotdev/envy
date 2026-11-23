"use client";

import { Monitor, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ChangePassword } from "@/components/change-password";
import { PageHeader } from "@/components/page-header";
import { LoadError, LoadingRows } from "@/components/states";
import { StatusBadge } from "@/components/status-badge";
import { TableFrame } from "@/components/table-frame";
import { TimeAgo } from "@/components/time-ago";
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
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLoad } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";

type Device = { id: string; deviceName: string; client: string };

/** Every signed-in device, so a lost laptop can be signed out from here. */
export default function DevicesPage() {
  useDocumentTitle("Devices");
  const { state, reload } = useLoad(() => call((api) => api.v1.me.sessions.get()), [], {
    cacheKey: "devices",
  });
  const [signingOut, setSigningOut] = useState<Device | undefined>();
  const [busy, setBusy] = useState(false);

  async function signOutDevice(device: Device) {
    setBusy(true);
    try {
      await call((api) => api.v1.me.sessions({ id: device.id }).delete());
      toast.success(`Signed out ${device.deviceName}`);
      setSigningOut(undefined);
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Signed-in devices"
        description="Every browser and CLI signed in to your account. Sign out any you do not recognise, or a lost laptop."
      />
      {state.status === "loading" ? <LoadingRows label="Loading devices" /> : null}
      {state.status === "error" ? <LoadError message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" ? (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Signed in</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.items.map((device) => (
                <TableRow key={device.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {device.client === "cli" ? (
                        <Terminal className="size-4 text-muted-foreground" aria-label="CLI" />
                      ) : (
                        <Monitor className="size-4 text-muted-foreground" aria-label="Browser" />
                      )}
                      <span className="font-medium">{device.deviceName}</span>
                      {device.isCurrent ? (
                        <StatusBadge tone="success">this browser</StatusBadge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <TimeAgo value={device.lastUsedAt} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <TimeAgo value={device.createdAt} />
                  </TableCell>
                  <TableCell className="text-right">
                    {device.isCurrent ? null : (
                      <Button variant="outline" size="sm" onClick={() => setSigningOut(device)}>
                        Sign out
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableFrame>
      ) : null}
      <AlertDialog
        open={signingOut !== undefined}
        onOpenChange={(open) => (open || busy ? undefined : setSigningOut(undefined))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out {signingOut?.deviceName}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stops working at once and has to sign in with GitHub again. Its master password is
              not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              disabled={busy}
              onClick={() =>
                signingOut === undefined ? undefined : void signOutDevice(signingOut)
              }
            >
              {busy ? <Spinner /> : null}
              Sign out device
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ChangePassword />
    </>
  );
}

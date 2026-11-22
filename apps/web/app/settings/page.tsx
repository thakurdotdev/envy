"use client";

import { toast } from "sonner";
import { AppShell, PageTitle } from "@/components/app-shell";
import { LoadError, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
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
import { call, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/envy";

export default function SettingsPage() {
  return (
    <AppShell>
      <Devices />
    </AppShell>
  );
}

/** Every signed-in device, so a lost laptop can be signed out from here. */
function Devices() {
  const { state, reload } = useLoad(() => call((api) => api.v1.me.sessions.get()), []);

  async function signOutDevice(sessionId: string) {
    try {
      await call((api) => api.v1.me.sessions({ id: sessionId }).delete());
      toast.success("That device is signed out");
      reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <>
      <PageTitle title="Signed-in devices" />
      {state.status === "loading" ? <LoadingRows label="Loading devices" /> : null}
      {state.status === "error" ? <LoadError message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" ? (
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
                  {device.deviceName} <Badge variant="secondary">{device.client}</Badge>
                  {device.isCurrent ? <Badge className="ml-2">this browser</Badge> : null}
                </TableCell>
                <TableCell>{formatDate(device.lastUsedAt)}</TableCell>
                <TableCell>{formatDate(device.createdAt)}</TableCell>
                <TableCell className="text-right">
                  {device.isCurrent ? null : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void signOutDevice(device.id)}
                    >
                      Sign out
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
    </>
  );
}

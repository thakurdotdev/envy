"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell, PageTitle } from "@/components/app-shell";
import { EmptyState, LoadError, LoadingRows } from "@/components/states";
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

export default function AuditPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows label="Loading audit log" />}>
        <AuditLog />
      </Suspense>
    </AppShell>
  );
}

type AuditItem = {
  id: string;
  action: string;
  actorId: string;
  targetType: string;
  metadata: Record<string, string | number | boolean | null> | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

function AuditLog() {
  const projectId = useSearchParams().get("id") ?? "";
  const { state, reload } = useLoad(
    () => call((api) => api.v1.projects({ id: projectId }).audit.get({ query: { limit: 50 } })),
    [projectId],
  );
  const [more, setMore] = useState<{ items: AuditItem[]; nextCursor: string | null } | undefined>();
  const [error, setError] = useState<string | undefined>();

  if (state.status === "loading") {
    return <LoadingRows label="Loading audit log" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const items = [...state.data.items, ...(more?.items ?? [])];
  const nextCursor = more === undefined ? state.data.nextCursor : more.nextCursor;

  async function loadMore(cursor: string) {
    try {
      const page = await call((api) =>
        api.v1.projects({ id: projectId }).audit.get({ query: { cursor, limit: 50 } }),
      );
      setMore((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        nextCursor: page.nextCursor,
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <>
      <PageTitle title="Audit log" />
      {items.length === 0 ? <EmptyState title="Nothing has happened yet" /> : null}
      {items.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>What</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>From</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="whitespace-nowrap">{formatDate(item.createdAt)}</TableCell>
                <TableCell className="font-mono text-sm">{item.action}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {Object.entries(item.metadata ?? {})
                    .map(([name, value]) => `${name}: ${String(value)}`)
                    .join(", ")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.ip ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}
      {error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {nextCursor === null ? null : (
        <Button variant="outline" className="mt-4" onClick={() => void loadMore(nextCursor)}>
          Load more
        </Button>
      )}
    </>
  );
}

"use client";

import { Suspense, useState } from "react";
import { SectionHeader } from "@/components/page-header";
import { ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { EmptyState, LoadError, LoadingRows } from "@/components/states";
import { TableFrame } from "@/components/table-frame";
import { TimeAgo } from "@/components/time-ago";
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
import { call, errorMessage } from "@/lib/api";

export default function AuditPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading audit log" />}>
      <ProjectFrame section="Audit log">{(project) => <AuditLog project={project} />}</ProjectFrame>
    </Suspense>
  );
}

type Metadata = Record<string, string | number | boolean | null>;

type AuditItem = {
  id: string;
  action: string;
  actorType: string;
  actorName?: string | null;
  metadata: Metadata | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

const REVOKE_REASONS: Record<string, string> = {
  "creator removed": " (its maker was removed)",
  "app removed": " (its app was removed)",
};

// Plain words for each action, and which details are worth showing.
const ACTIONS: Record<string, { label: string; describe?: (metadata: Metadata) => string }> = {
  "project.created": { label: "Created the project" },
  "project.renamed": {
    label: "Renamed the project",
    describe: (m) => `to ${String(m["name"] ?? "")}`,
  },
  "project.deleted": { label: "Deleted the project" },
  "project.restored": { label: "Restored the project" },
  "app.created": {
    label: "Added an app",
    describe: (m) => String(m["name"] ?? ""),
  },
  "app.removed": {
    label: "Removed an app",
    describe: (m) => String(m["name"] ?? ""),
  },
  "environment.created": {
    label: "Added an environment",
    describe: (m) => String(m["name"] ?? ""),
  },
  "environment.rotated": {
    label: "Changed an environment key",
    describe: (m) => `key version ${String(m["keyVersion"] ?? "")}`,
  },
  "secrets.read": {
    label: "Read secrets",
    describe: (m) => `version ${String(m["version"] ?? "")}`,
  },
  "secrets.pushed": {
    label: "Saved secrets",
    describe: (m) => `version ${String(m["version"] ?? "")}`,
  },
  "member.invited": {
    label: "Invited someone",
    describe: (m) => `${String(m["email"] ?? "")} as ${String(m["role"] ?? "")}`,
  },
  "member.joined": {
    label: "Accepted an invite",
    describe: (m) => `as ${String(m["role"] ?? "")}`,
  },
  "member.granted": {
    label: "Gave access",
    describe: (m) => `to @${String(m["githubLogin"] ?? "")}`,
  },
  "member.role_changed": {
    label: "Changed a role",
    describe: (m) =>
      `@${String(m["githubLogin"] ?? "")}: ${String(m["from"] ?? "")} → ${String(m["to"] ?? "")}`,
  },
  "member.removed": {
    label: "Removed a member",
    describe: (m) => `@${String(m["githubLogin"] ?? "")}`,
  },
  "token.created": {
    label: "Made a service token",
    describe: (m) => `"${String(m["name"] ?? "")}" for ${String(m["environment"] ?? "")}`,
  },
  "token.revoked": {
    label: "Revoked a service token",
    describe: (m) =>
      `"${String(m["name"] ?? "")}"${REVOKE_REASONS[String(m["reason"] ?? "")] ?? ""}`,
  },
};

function describeAction(item: AuditItem): { label: string; details: string } {
  const known = ACTIONS[item.action];
  const metadata = item.metadata ?? {};
  if (known === undefined) {
    const details = Object.entries(metadata)
      .map(([name, value]) => `${name}: ${String(value)}`)
      .join(", ");
    return { label: item.action, details };
  }
  return { label: known.label, details: known.describe?.(metadata) ?? "" };
}

function describeActor(item: AuditItem): string | undefined {
  // An API from before names were added sends no actorName at all.
  if (item.actorName === undefined) {
    return undefined;
  }
  return item.actorName ?? "a deleted account";
}

function AuditLog({ project }: { project: ProjectInfo }) {
  const { state, reload } = useLoad(
    () => call((api) => api.v1.projects({ id: project.id }).audit.get({ query: { limit: 50 } })),
    [project.id],
    { cacheKey: `audit:${project.id}` },
  );
  const [more, setMore] = useState<{ items: AuditItem[]; nextCursor: string | null } | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (state.status === "loading") {
    return <LoadingRows label="Loading audit log" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const items: AuditItem[] = [...state.data.items, ...(more?.items ?? [])];
  const nextCursor = more === undefined ? state.data.nextCursor : more.nextCursor;

  async function loadMore(cursor: string) {
    setLoadingMore(true);
    setError(undefined);
    try {
      const page = await call((api) =>
        api.v1.projects({ id: project.id }).audit.get({ query: { cursor, limit: 50 } }),
      );
      setMore((current) => ({
        items: [...(current?.items ?? []), ...page.items],
        nextCursor: page.nextCursor,
      }));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="audit-heading">
      <SectionHeader
        id="audit-heading"
        title="Audit log"
        description="Who read or changed what, newest first. Values are never recorded."
      />
      {items.length === 0 ? <EmptyState title="Nothing has happened yet" /> : null}
      {items.length > 0 ? (
        <TableFrame>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
                <TableHead>From</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const { label, details } = describeAction(item);
                const actor = describeActor(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-muted-foreground">
                      <TimeAgo value={item.createdAt} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {actor ?? <span className="text-muted-foreground">None</span>}
                      {item.actorType === "token" ? (
                        <span className="ml-1 text-xs text-muted-foreground">(token)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      <span className="font-medium">{label}</span>
                      {details === "" ? null : (
                        <span className="ml-1.5 text-muted-foreground">{details}</span>
                      )}
                    </TableCell>
                    <TableCell
                      className="font-mono text-xs whitespace-nowrap text-muted-foreground"
                      title={item.userAgent ?? undefined}
                    >
                      {item.ip ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableFrame>
      ) : null}
      {error === undefined ? null : (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {nextCursor === null ? null : (
        <Button
          variant="outline"
          className="mt-4"
          disabled={loadingMore}
          onClick={() => void loadMore(nextCursor)}
        >
          {loadingMore ? <Spinner /> : null}
          Load older entries
        </Button>
      )}
    </section>
  );
}

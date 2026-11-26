"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight, FolderLock, Plus } from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/page-header";
import { InlineCode } from "@/components/inline-code";
import { LoadError, LoadingRows } from "@/components/states";
import { RoleBadge, StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { forgetCached, useLoad } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";
import { createProject, formatDate } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";

export default function ProjectsPage() {
  useDocumentTitle("Projects");
  const { state, reload } = useLoad(
    () => call((api) => api.v1.projects.get({ query: { limit: 100 } })),
    [],
    { cacheKey: "projects" },
  );
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project has its own environments, members and tokens."
      >
        {/* With no projects yet, the empty state below offers the same button. */}
        {state.status === "ready" && state.data.items.length === 0 ? null : (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New project
          </Button>
        )}
      </PageHeader>
      {state.status === "loading" ? <LoadingRows label="Loading projects" /> : null}
      {state.status === "error" ? <LoadError message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.data.items.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed bg-card/50 px-4 py-16 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg border bg-card text-muted-foreground shadow-xs">
            <FolderLock className="size-5" />
          </span>
          <p className="mt-4 font-medium">No projects yet</p>
          <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
            Create one here, or run <InlineCode>envy init</InlineCode> in a project folder to upload
            its .env files.
          </p>
          <Button className="mt-6" onClick={() => setCreating(true)}>
            <Plus /> New project
          </Button>
        </div>
      ) : null}
      {state.status === "ready" ? (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {state.data.items.map((project) => (
            <li key={project.id}>
              <Link
                href={`/project?id=${project.id}`}
                className="group flex h-full flex-col gap-4 rounded-lg border bg-card p-4 shadow-xs transition-colors hover:border-input hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <span className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted font-mono text-sm font-medium text-muted-foreground"
                  >
                    {monogram(project.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{project.name}</span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {project.slug}
                    </span>
                  </span>
                  <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                </span>
                <span className="flex flex-wrap gap-1.5">
                  <RoleBadge role={project.role} />
                  {(project.pendingMembers ?? 0) > 0 ? (
                    <StatusBadge tone="warning">
                      {project.pendingMembers} waiting for access
                    </StatusBadge>
                  ) : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <RecentlyDeleted onRestored={reload} />
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

/** Projects the user deleted in the last 30 days. Hidden when there are none. */
function RecentlyDeleted({ onRestored }: { onRestored: () => void }) {
  const { state, reload } = useLoad(() => call((api) => api.v1.projects.deleted.get()), [], {
    cacheKey: "projects:deleted",
  });
  const [restoring, setRestoring] = useState<string | undefined>();
  if (state.status !== "ready" || state.data.items.length === 0) {
    return null;
  }

  async function restore(project: { id: string; name: string }) {
    setRestoring(project.id);
    try {
      await call((api) => api.v1.projects({ id: project.id }).restore.post());
      forgetCached("projects");
      toast.success(`Restored ${project.name}`);
      reload();
      onRestored();
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setRestoring(undefined);
    }
  }

  return (
    <section aria-labelledby="deleted-heading" className="mt-12">
      <SectionHeader
        id="deleted-heading"
        title="Recently deleted"
        description="Nobody can read these. Restore one within 30 days, or it is removed for good."
      />
      <ul className="divide-y rounded-lg border bg-card">
        {state.data.items.map((project) => (
          <li key={project.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{project.name}</span>
              <span className="block text-xs text-muted-foreground">
                {project.purgeAfter === null
                  ? ""
                  : `Removed for good on ${formatDate(project.purgeAfter)}`}
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={restoring !== undefined}
              onClick={() => void restore(project)}
            >
              {restoring === project.id ? <Spinner /> : null}
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The first letter of a project name, for the small square on its card. */
function monogram(name: string): string {
  const [first = ""] = Array.from(name.trim());
  return first.toLocaleUpperCase();
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { keys } = useUnlocked();
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const project = await createProject(keys, name.trim());
      forgetCached("projects");
      toast.success(`Created ${project.name}`);
      router.push(`/project?id=${project.id}`);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) {
          return;
        }
        if (!next) {
          setName("");
          setError(undefined);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              It starts with shared, development, staging and production. The keys are made in this
              browser.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="project-name">Name</Label>
            <Input
              id="project-name"
              value={name}
              placeholder="my-app"
              maxLength={100}
              autoComplete="off"
              aria-invalid={error !== undefined}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {error === undefined ? null : (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || name.trim() === ""}>
              {busy ? <Spinner /> : null}
              Create project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

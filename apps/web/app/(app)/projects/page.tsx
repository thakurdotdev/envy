"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ChevronRight, Plus } from "lucide-react";
import { PageTitle } from "@/components/app-shell";
import { EmptyState, LoadError, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { createProject } from "@/lib/envy";
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
      <PageTitle
        title="Projects"
        description="Each project has its own environments, members and tokens."
      >
        {/* With no projects yet, the empty state below offers the same button. */}
        {state.status === "ready" && state.data.items.length === 0 ? null : (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New project
          </Button>
        )}
      </PageTitle>
      {state.status === "loading" ? <LoadingRows label="Loading projects" /> : null}
      {state.status === "error" ? <LoadError message={state.message} onRetry={reload} /> : null}
      {state.status === "ready" && state.data.items.length === 0 ? (
        <EmptyState title="No projects yet">
          <p>
            Create one here, or run <code className="font-mono">envy init</code> in a project folder
            to upload its .env files.
          </p>
          <Button className="mt-4" onClick={() => setCreating(true)}>
            <Plus /> New project
          </Button>
        </EmptyState>
      ) : null}
      {state.status === "ready" ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {state.data.items.map((project) => (
            <li key={project.id}>
              <Link
                href={`/project?id=${project.id}`}
                className="group block rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Card className="transition-colors group-hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2">
                      <span className="truncate">{project.name}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </CardTitle>
                    <CardDescription className="flex gap-2">
                      <Badge variant="secondary">{project.role}</Badge>
                      {(project.pendingMembers ?? 0) > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-amber-700 dark:text-amber-300"
                        >
                          {project.pendingMembers} waiting for access
                        </Badge>
                      ) : null}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </>
  );
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
              {busy ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

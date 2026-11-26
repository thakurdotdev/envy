"use client";

import { useRouter } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InlineCode } from "@/components/inline-code";
import { ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { LoadingRows } from "@/components/states";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { forgetCached } from "@/hooks/use-load";
import { call, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/envy";

export default function ProjectSettingsPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading project" />}>
      <ProjectFrame section="Settings">
        {(project, reloadProject) => (
          <div className="space-y-8">
            <RenameProject project={project} onRenamed={reloadProject} />
            {project.role === "owner" ? <DeleteProject project={project} /> : null}
          </div>
        )}
      </ProjectFrame>
    </Suspense>
  );
}

function RenameProject({ project, onRenamed }: { project: ProjectInfo; onRenamed: () => void }) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const unchanged = name.trim() === "" || name.trim() === project.name;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await call((api) => api.v1.projects({ id: project.id }).patch({ name: name.trim() }));
      forgetCached("projects");
      toast.success("Renamed the project");
      onRenamed();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Card className="gap-5">
        <CardHeader>
          <CardTitle>Name</CardTitle>
          <CardDescription>
            Only the name changes. The id in <InlineCode>.envy.json</InlineCode> stays the same, so
            nothing needs to be linked again.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
            className="max-w-sm"
          />
          {error === undefined ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={busy || unchanged}>
            {busy ? <Spinner /> : null}
            Save name
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

/** Owner only. Asks for the project's slug before deleting, like GitHub does. */
function DeleteProject({ project }: { project: ProjectInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function remove() {
    setBusy(true);
    setError(undefined);
    try {
      const deleted = await call((api) => api.v1.projects({ id: project.id }).delete());
      forgetCached("projects");
      forgetCached(`project:${project.id}`);
      toast.success(`Deleted ${project.name}`, {
        description: `You can restore it from Projects until ${formatDate(deleted.purgeAfter)}.`,
      });
      router.push("/projects");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  return (
    <Card className="gap-5 border-destructive/40">
      <CardHeader>
        <CardTitle>Delete project</CardTitle>
        <CardDescription>
          Everyone loses access at once, and every service token stops working. You can restore it
          for 30 days; after that its secrets, history and audit log are removed for good.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Delete project
        </Button>
      </CardFooter>
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (!busy) {
            setOpen(next);
            setTyped("");
            setError(undefined);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {project.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Type <InlineCode>{project.slug}</InlineCode> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="confirm-delete" className="sr-only">
              Project slug
            </Label>
            <Input
              id="confirm-delete"
              className="font-mono"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
            {error === undefined ? null : (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy || typed.trim() !== project.slug}
              onClick={() => void remove()}
            >
              {busy ? <Spinner /> : null}
              Delete project
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

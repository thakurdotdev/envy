"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AppShell, PageTitle } from "@/components/app-shell";
import { HistoryPanel } from "@/components/history-panel";
import { SecretEditor } from "@/components/secret-editor";
import { LoadError, LoadingRows } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLoad } from "@/hooks/use-load";
import { call } from "@/lib/api";
import { listEnvironments } from "@/lib/envy";

// IDs are not known when the site is built, so pages take them as ?id=.
export default function ProjectPage() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingRows label="Loading project" />}>
        <Project />
      </Suspense>
    </AppShell>
  );
}

function Project() {
  const projectId = useSearchParams().get("id") ?? "";
  // Bumped after a save or rollback, so the editor and history load again
  // without re-mounting the tabs (which would jump back to the first one).
  const [revision, setRevision] = useState(0);
  const bumpRevision = () => setRevision((current) => current + 1);
  const { state, reload } = useLoad(async () => {
    const [project, environments] = await Promise.all([
      call((api) => api.v1.projects({ id: projectId }).get()),
      listEnvironments(projectId),
    ]);
    return { project, environments };
  }, [projectId]);

  if (state.status === "loading") {
    return <LoadingRows label="Loading project" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const { project, environments } = state.data;
  const canEdit = project.role !== "viewer";
  const isAdmin = project.role === "owner" || project.role === "admin";
  const firstTab =
    environments.find((environment) => environment.name === "development") ?? environments[0];

  return (
    <>
      <PageTitle title={project.name}>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/members?id=${project.id}`}>Members</Link>
          </Button>
          {isAdmin ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/audit?id=${project.id}`}>Audit log</Link>
            </Button>
          ) : null}
        </div>
      </PageTitle>
      <Tabs defaultValue={firstTab?.id}>
        <TabsList aria-label="Environments">
          {environments.map((environment) => (
            <TabsTrigger key={environment.id} value={environment.id}>
              {environment.name}
              {environment.isProtected ? <Badge variant="destructive">protected</Badge> : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {environments.map((environment) => (
          <TabsContent key={environment.id} value={environment.id} className="mt-4 space-y-8">
            <section aria-label={`${environment.name} variables`}>
              <SecretEditor
                key={`${environment.id}-${revision}`}
                projectId={project.id}
                environment={environment}
                canEdit={canEdit}
                onSaved={bumpRevision}
              />
            </section>
            <section aria-labelledby={`history-${environment.id}`}>
              <h2 id={`history-${environment.id}`} className="mb-3 text-lg font-semibold">
                History
              </h2>
              <HistoryPanel
                revision={revision}
                projectId={project.id}
                environment={environment}
                canEdit={canEdit}
                onChanged={bumpRevision}
              />
            </section>
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}

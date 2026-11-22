"use client";

import { Lock } from "lucide-react";
import { Suspense, useCallback, useState } from "react";
import { SectionTitle } from "@/components/app-shell";
import { HistoryPanel } from "@/components/history-panel";
import { ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { SecretEditor } from "@/components/secret-editor";
import { LoadError, LoadingRows } from "@/components/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLoad } from "@/hooks/use-load";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { listEnvironments } from "@/lib/envy";

// IDs are not known when the site is built, so pages take them as ?id=.
export default function ProjectPage() {
  return (
    <Suspense fallback={<LoadingRows label="Loading project" />}>
      <ProjectFrame section="Variables">
        {(project) => <Environments project={project} />}
      </ProjectFrame>
    </Suspense>
  );
}

function Environments({ project }: { project: ProjectInfo }) {
  const { state, reload } = useLoad(() => listEnvironments(project.id), [project.id], {
    cacheKey: `environments:${project.id}`,
  });
  const [selected, setSelected] = useState<string | undefined>();
  // Editors stay mounted once opened, so switching tabs keeps unsaved edits.
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  // Bumped after a save or rollback, so that environment loads again.
  const [revisions, setRevisions] = useState<Record<string, number>>({});
  useUnsavedChangesWarning(Object.values(dirty).some(Boolean));

  const setDirtyFor = useCallback((environmentId: string, isDirty: boolean) => {
    setDirty((current) =>
      current[environmentId] === isDirty ? current : { ...current, [environmentId]: isDirty },
    );
  }, []);

  if (state.status === "loading") {
    return <LoadingRows label="Loading environments" />;
  }
  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  const environments = state.data;
  const canEdit = project.role !== "viewer";
  const fallback =
    environments.find((environment) => environment.name === "development") ?? environments[0];
  const current =
    environments.find((environment) => environment.id === selected)?.id ?? fallback?.id;
  const bump = (environmentId: string) =>
    setRevisions((all) => ({ ...all, [environmentId]: (all[environmentId] ?? 0) + 1 }));

  return (
    <Tabs
      value={current}
      onValueChange={(environmentId) => {
        if (current !== undefined) {
          setOpened((all) => new Set(all).add(current));
        }
        setSelected(environmentId);
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4 pb-1">
        <TabsList aria-label="Environments">
          {environments.map((environment) => (
            <TabsTrigger key={environment.id} value={environment.id} className="px-2.5">
              {environment.isProtected ? (
                <Lock aria-label="protected" className="text-muted-foreground" />
              ) : null}
              {environment.name}
              {dirty[environment.id] === true ? (
                <span
                  className="size-1.5 rounded-full bg-amber-500"
                  role="img"
                  aria-label="unsaved changes"
                />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {environments
        .filter((environment) => environment.id === current || opened.has(environment.id))
        .map((environment) => (
          <TabsContent
            key={environment.id}
            value={environment.id}
            forceMount
            className="mt-4 space-y-10 data-[state=inactive]:hidden"
          >
            <section aria-label={`${environment.name} variables`}>
              <SecretEditor
                key={`${environment.id}-${revisions[environment.id] ?? 0}`}
                projectId={project.id}
                environment={environment}
                canEdit={canEdit}
                isActive={environment.id === current}
                onSaved={() => bump(environment.id)}
                onDirtyChange={(isDirty) => setDirtyFor(environment.id, isDirty)}
              />
            </section>
            <section aria-labelledby={`history-${environment.id}`}>
              <SectionTitle
                id={`history-${environment.id}`}
                title="History"
                description="Every save is a new version. Compare one to see which names it changes."
              />
              <HistoryPanel
                revision={revisions[environment.id] ?? 0}
                projectId={project.id}
                environment={environment}
                canEdit={canEdit}
                onChanged={() => bump(environment.id)}
              />
            </section>
          </TabsContent>
        ))}
    </Tabs>
  );
}

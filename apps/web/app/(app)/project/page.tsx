"use client";

import { Lock } from "lucide-react";
import { Suspense, useCallback, useState } from "react";
import { SectionHeader } from "@/components/page-header";
import { HistoryPanel } from "@/components/history-panel";
import { ProjectFrame, type ProjectInfo } from "@/components/project-frame";
import { SecretEditor } from "@/components/secret-editor";
import { LoadError, LoadingRows } from "@/components/states";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLoad } from "@/hooks/use-load";
import { useUnsavedChangesWarning } from "@/hooks/use-unsaved-changes";
import { listApps, listEnvironments, type AppSummary } from "@/lib/envy";

// The root's own environments, in the app picker.
const ROOT = "root";

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
  const { state, reload } = useLoad(
    async () => {
      const [environments, apps] = await Promise.all([
        listEnvironments(project.id),
        listApps(project.id),
      ]);
      return { environments, apps };
    },
    [project.id],
    { cacheKey: `environments:${project.id}` },
  );
  const [selected, setSelected] = useState<string | undefined>();
  // A monorepo's app (ADR 0018), or the root's own environments.
  const [app, setApp] = useState<string>(ROOT);
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
  const { apps } = state.data;
  const appId = apps.some((candidate) => candidate.id === app) ? app : null;
  const environments = state.data.environments.filter((environment) => environment.appId === appId);
  const canEdit = project.role !== "viewer";
  const fallback =
    environments.find((environment) => environment.name === "development") ?? environments[0];
  const currentEnvironment =
    environments.find((environment) => environment.id === selected) ?? fallback;
  const current = currentEnvironment?.id;
  // Switching apps keeps the same stage, so production stays production.
  const chooseApp = (nextApp: string) => {
    const nextAppId = nextApp === ROOT ? null : nextApp;
    const sameStage = state.data.environments.find(
      (environment) =>
        environment.appId === nextAppId && environment.name === currentEnvironment?.name,
    );
    if (current !== undefined) {
      setOpened((all) => new Set(all).add(current));
    }
    setApp(nextApp);
    setSelected(sameStage?.id);
  };
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
      {apps.length === 0 ? null : (
        <AppPicker
          apps={apps}
          value={appId ?? ROOT}
          onChange={chooseApp}
          stage={currentEnvironment?.name}
        />
      )}
      <div className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList aria-label="Environments" className="h-9 border bg-muted/60">
          {environments.map((environment) => (
            <TabsTrigger key={environment.id} value={environment.id} className="px-3">
              {environment.isProtected ? (
                <Lock aria-label="protected" className="text-muted-foreground" />
              ) : null}
              {environment.name}
              {dirty[environment.id] === true ? (
                <span
                  className="size-1.5 rounded-full bg-brand"
                  role="img"
                  aria-label="unsaved changes"
                />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {state.data.environments
        .filter((environment) => environment.id === current || opened.has(environment.id))
        .map((environment) => (
          <TabsContent
            key={environment.id}
            value={environment.id}
            forceMount
            className="mt-5 space-y-12 data-[state=inactive]:hidden"
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
              <SectionHeader
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

/** Picks the root or one app of a monorepo. Shown only when the project has apps. */
function AppPicker({
  apps,
  value,
  onChange,
  stage,
}: {
  apps: AppSummary[];
  value: string;
  onChange: (app: string) => void;
  stage: string | undefined;
}) {
  const isRoot = value === ROOT;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
      <Label htmlFor="app-picker" className="text-muted-foreground">
        App
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id="app-picker" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ROOT}>Root (every app)</SelectItem>
          {apps.map((candidate) => (
            <SelectItem key={candidate.id} value={candidate.id}>
              {candidate.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        {isRoot
          ? "Values here reach every app in the same stage."
          : `Merged on top of shared${stage === undefined ? "" : ` and the root's ${stage}`} when the app runs.`}
      </p>
    </div>
  );
}

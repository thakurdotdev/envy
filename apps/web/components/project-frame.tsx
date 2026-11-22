"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { useLoad } from "@/hooks/use-load";
import { call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { LoadError, LoadingRows } from "./states";
import { RoleBadge } from "./status-badge";

export type ProjectInfo = {
  id: string;
  name: string;
  /** owner, admin, member or viewer. */
  role: string;
};

export function isAdminRole(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** The project id from `?id=`: ids are not known when the site is built. */
export function useProjectId(): string {
  return useSearchParams().get("id") ?? "";
}

/**
 * Breadcrumb, name and sub-navigation shared by every page of a project.
 * The project is cached, so moving between its pages shows this at once.
 */
export function ProjectFrame({
  section,
  children,
}: {
  /** The page's own name, for the tab title ("Members"). */
  section: string;
  children: (project: ProjectInfo) => ReactNode;
}) {
  const projectId = useProjectId();
  const { state, reload } = useLoad(
    () => call((api) => api.v1.projects({ id: projectId }).get()),
    [projectId],
    { cacheKey: `project:${projectId}` },
  );
  const project = state.status === "ready" ? state.data : undefined;
  useDocumentTitle(project === undefined ? undefined : `${section} · ${project.name}`);

  if (state.status === "error") {
    return <LoadError message={state.message} onRetry={reload} />;
  }
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted-foreground">
        <ol className="flex min-w-0 items-center gap-1">
          <li>
            <Link href="/projects" className="transition-colors hover:text-foreground">
              Projects
            </Link>
          </li>
          <li aria-hidden>
            <ChevronRight className="size-3.5" />
          </li>
          <li className="truncate text-foreground" aria-current="page">
            {project?.name ?? "…"}
          </li>
        </ol>
      </nav>
      {project === undefined ? (
        <>
          <Skeleton className="mb-5 h-8 w-48" />
          <LoadingRows label="Loading project" />
        </>
      ) : (
        <>
          <div className="mb-5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
            <RoleBadge role={project.role} title="Your role in this project" />
          </div>
          <ProjectNav project={project} />
          {children(project)}
        </>
      )}
    </>
  );
}

function ProjectNav({ project }: { project: ProjectInfo }) {
  const pathname = usePathname();
  const isAdmin = isAdminRole(project.role);
  const links = [
    { href: "/project", label: "Variables", show: true },
    { href: "/members", label: "Members", show: true },
    { href: "/tokens", label: "Service tokens", show: isAdmin },
    { href: "/audit", label: "Audit log", show: isAdmin },
  ].filter((link) => link.show);

  return (
    <nav
      aria-label="Project"
      className="scrollbar-none -mx-4 mb-8 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex gap-1">
        {links.map((link) => {
          const active = pathname === link.href;
          return (
            <li key={link.href}>
              <Link
                href={`${link.href}?id=${project.id}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 px-3 text-sm whitespace-nowrap transition-colors focus-visible:border-ring focus-visible:text-foreground focus-visible:outline-none",
                  active
                    ? "border-brand font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

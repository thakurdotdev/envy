"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ALL_DOC_SECTIONS, DOC_GROUPS } from "./sections";

const ALL_IDS = ALL_DOC_SECTIONS.map((section) => section.id);

/**
 * Remembers which section is being read: the last one whose top has passed
 * the line just under the sticky header.
 */
function useCurrentSection(): string {
  const [current, setCurrent] = useState<string>(ALL_IDS[0] ?? "");

  useEffect(() => {
    function update() {
      const line = 120;
      let found = ALL_IDS[0] ?? "";
      for (const id of ALL_IDS) {
        const element = document.getElementById(id);
        if (element !== null && element.getBoundingClientRect().top <= line) {
          found = id;
        }
      }
      // At the very bottom, the last short sections can never reach the line.
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 4;
      setCurrent(atBottom ? (ALL_IDS.at(-1) ?? found) : found);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return current;
}

/** The sidebar on wide screens. */
export function DocsSidebar() {
  const current = useCurrentSection();
  return (
    <nav aria-label="Docs" className="sticky top-24 space-y-7">
      {DOC_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="mb-2 text-xs font-medium text-foreground">{group.title}</p>
          <ul className="space-y-px border-l text-sm">
            {group.sections.map((section) => {
              const active = section.id === current;
              return (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    aria-current={active ? "location" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1 pl-3.5 transition-colors",
                      active
                        ? "border-brand text-foreground"
                        : "border-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {section.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** On phones: a closed list at the top of the page that opens on tap. */
export function DocsMobileNav() {
  const current = useCurrentSection();
  const [open, setOpen] = useState(false);
  const currentTitle =
    ALL_DOC_SECTIONS.find((section) => section.id === current)?.title ?? "Contents";

  return (
    <nav
      aria-label="Docs"
      className="-mx-4 border-b bg-background/90 px-4 backdrop-blur-md sm:-mx-6 sm:px-6"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="docs-mobile-list"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 py-3 text-sm"
      >
        <span className="text-muted-foreground">
          On this page: <span className="text-foreground">{currentTitle}</span>
        </span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div id="docs-mobile-list" className="max-h-[60svh] space-y-5 overflow-y-auto pt-1 pb-5">
          {DOC_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="mb-1.5 text-xs font-medium">{group.title}</p>
              <ul className="space-y-px">
                {group.sections.map((section) => (
                  <li key={section.id}>
                    <a
                      href={`#${section.id}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block py-1.5 text-sm",
                        section.id === current ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}

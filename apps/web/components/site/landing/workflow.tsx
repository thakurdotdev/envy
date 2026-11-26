"use client";

import { useState, type KeyboardEvent } from "react";
import { TerminalWindow, type TerminalLine } from "@/components/site/terminal";
import { cn } from "@/lib/utils";

type Moment = {
  id: string;
  title: string;
  text: string;
  where: string;
  lines: TerminalLine[];
};

// Each session uses the CLI's real messages. Names, codes and values are made up.
const MOMENTS: Moment[] = [
  {
    id: "link",
    title: "Link a project",
    text: "Run it once in your repo. Your existing .env files are uploaded, encrypted, and .env is added to .gitignore.",
    where: "~/acme",
    lines: [
      { kind: "command", text: "envy init --create acme" },
      { kind: "info", text: "Added .env files to .gitignore." },
      {
        kind: "success",
        text: "Linked to acme. Imported 12 from .env → development. Commit .envy.json, then run: envy run -- <your command>",
      },
    ],
  },
  {
    id: "run",
    title: "Run your app",
    text: "envy run starts your command with the variables set. No .env file is written. Use envy pull when a tool needs the file.",
    where: "~/acme",
    lines: [
      { kind: "command", text: "envy run -- npm run dev" },
      { kind: "blank" },
      { kind: "info", text: "> acme@1.0.0 dev" },
      { kind: "info", text: "> next dev" },
      { kind: "blank" },
      { kind: "info", text: "  - Local: http://localhost:3000" },
    ],
  },
  {
    id: "change",
    title: "Change a value",
    text: "Set a value without it landing in your shell history. Teammates see which names changed when they pull, never the values.",
    where: "~/acme",
    lines: [
      { kind: "command", text: "envy set STRIPE_KEY" },
      { kind: "answered", question: "Value for STRIPE_KEY", answer: "••••••••••••••••" },
      { kind: "success", text: "Set 1 variable in development (version 9)." },
      { kind: "blank" },
      { kind: "comment", text: "on Sam's laptop" },
      { kind: "command", text: "envy pull" },
      { kind: "diff", changed: ["STRIPE_KEY"] },
      { kind: "success", text: "Pulled 12 variables from development → .env" },
    ],
  },
  {
    id: "team",
    title: "Add a teammate",
    text: "Invite by email. When Sam accepts, you both see the same short code. Compare it on a call, then your machine locks the keys for Sam.",
    where: "~/acme",
    lines: [
      { kind: "command", text: "envy members invite sam@acme.dev" },
      { kind: "info", text: "Send this link to sam@acme.dev (it works once, for 7 days):" },
      { kind: "info", text: "https://envy.thakur.dev/invite?token=…" },
      { kind: "blank" },
      { kind: "comment", text: "Sam runs envy accept <link> and reads you their code" },
      { kind: "command", text: "envy members grant" },
      { kind: "info", text: "@sam (sam@acme.dev) key fingerprint: K7QD 2MXA 9FTE 4PWN" },
      {
        kind: "answered",
        question: "Does @sam see the same fingerprint? Give them access?",
        answer: "Yes",
      },
      { kind: "success", text: "@sam can now pull every environment." },
    ],
  },
  {
    id: "ci",
    title: "Deploy from CI",
    text: "Make a read-only token for one environment and save it as ENVY_TOKEN. CI gets the same values, and nothing else.",
    where: "~/acme",
    lines: [
      { kind: "command", text: "envy token create --env production --name deploy --expires 90d" },
      {
        kind: "info",
        text: "Store this as the ENVY_TOKEN secret in your CI. It is shown only once:",
      },
      { kind: "info", text: "envy_••••••••••••••••••••••••" },
      {
        kind: "success",
        text: 'Created "deploy": it can read production and the layers under it, and nothing else.',
      },
      { kind: "blank" },
      { kind: "comment", text: "in your deploy job, with ENVY_TOKEN set" },
      { kind: "command", text: "envy run -- ./deploy.sh" },
    ],
  },
];

/**
 * Five everyday moments. On wide screens: pick one on the left, see the
 * terminal on the right. On phones they are simply listed one after another,
 * because a tab far above its terminal is easy to miss.
 */
export function Workflow() {
  return (
    <>
      <ol className="space-y-12 lg:hidden">
        {MOMENTS.map((moment, index) => (
          <li key={moment.id} className="space-y-4">
            <div className="flex gap-4">
              <span className="mt-0.5 font-mono text-xs text-brand tabular-nums">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-medium">{moment.title}</h3>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{moment.text}</p>
              </div>
            </div>
            <TerminalWindow title={moment.where} lines={moment.lines} />
          </li>
        ))}
      </ol>
      <div className="hidden lg:block">
        <WorkflowTabs />
      </div>
    </>
  );
}

function WorkflowTabs() {
  const [activeId, setActiveId] = useState(MOMENTS[0]?.id ?? "");
  const active = MOMENTS.find((moment) => moment.id === activeId) ?? MOMENTS[0];

  // Arrow keys move between tabs, as in any tab list.
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) {
      return;
    }
    event.preventDefault();
    const current = MOMENTS.findIndex((moment) => moment.id === active?.id);
    const next = MOMENTS[(current + step + MOMENTS.length) % MOMENTS.length];
    if (next !== undefined) {
      setActiveId(next.id);
      document.getElementById(`moment-tab-${next.id}`)?.focus();
    }
  }

  return (
    <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12">
      <div
        role="tablist"
        aria-label="Moments"
        aria-orientation="vertical"
        className="space-y-1"
        onKeyDown={onKeyDown}
      >
        {MOMENTS.map((moment, index) => {
          const selected = moment.id === active?.id;
          return (
            <button
              key={moment.id}
              id={`moment-tab-${moment.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              aria-controls="moment-panel"
              onClick={() => setActiveId(moment.id)}
              className={cn(
                "group flex w-full gap-4 rounded-lg border px-4 py-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                selected
                  ? "border-border bg-card shadow-xs"
                  : "border-transparent hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 font-mono text-xs tabular-nums",
                  selected ? "text-brand" : "text-muted-foreground",
                )}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block font-medium">{moment.title}</span>
                <span className="mt-1 block text-sm text-pretty text-muted-foreground">
                  {moment.text}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {active === undefined ? null : (
        <div
          id="moment-panel"
          role="tabpanel"
          aria-labelledby={`moment-tab-${active.id}`}
          className="sticky top-24 min-w-0 self-start"
        >
          <TerminalWindow
            title={active.where}
            label={active.title}
            lines={active.lines}
            className="min-h-[22rem]"
          />
        </div>
      )}
    </div>
  );
}

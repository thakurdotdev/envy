import { Check, History, HardDriveDownload, Lock, ShieldCheck, Workflow } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { InlineCode } from "@/components/inline-code";
import { CopyCommand } from "@/components/site/copy-command";
import { INSTALL_COMMAND, RELEASES_URL } from "@/components/site/links";
import { Button } from "@/components/ui/button";

const STEPS = [
  {
    command: "envy login",
    title: "Sign in",
    text: "Sign in with GitHub and pick a master password. Only you know it.",
  },
  {
    command: "envy init",
    title: "Link your project",
    text: "Uploads your .env files. Commit .envy.json, it has no secrets in it.",
  },
  {
    command: "envy members invite",
    title: "Add your team",
    text: "Teammates run envy pull and get the same values you have.",
  },
];

const FACTS = [
  {
    icon: ShieldCheck,
    title: "Encrypted before it leaves",
    text: "Secrets are locked on your machine. The server only stores data it can't read.",
  },
  {
    icon: HardDriveDownload,
    title: "Nothing on disk",
    text: "envy run starts your app with the variables set. No .env file needed.",
  },
  {
    icon: Workflow,
    title: "Works in CI",
    text: "Make a read-only token for one environment and set it as ENVY_TOKEN.",
  },
  {
    icon: History,
    title: "Every change saved",
    text: "Each push is a new version. See what changed and roll back in one command.",
  },
];

// Made-up demo values. The "ciphertext" is not real output either.
const SEALED_ROWS = [
  {
    name: "DATABASE_URL",
    value: "postgres://localhost/acme",
    sealed: "b64:9f2aE1Qm7vXc0Lz8RwYp3Hn6c1e8",
  },
  { name: "STRIPE_KEY", value: "sk_test_demo", sealed: "b64:Kd4wT0pB2sYh8MnQ5eLr1Uf7a03b" },
  {
    name: "REDIS_URL",
    value: "redis://localhost:6379",
    sealed: "b64:x7Gm1Ja9Vc3Nq6Tz0Hs4Wd2Ef5d9",
  },
  { name: "LOG_LEVEL", value: "info", sealed: "b64:Pq2Ln8Rb5Yt0Ck7Mx3Hj9Sa4b7f2" },
];

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 pt-16 pb-20 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] md:pt-24 md:pb-28 lg:gap-20">
        <div className="min-w-0 space-y-7">
          <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground shadow-xs">
            <Lock className="size-3.5 text-brand" aria-hidden />
            End-to-end encrypted. Open source.
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
            Share <span className="text-brand">.env</span> files with your team.
          </h1>
          <p className="max-w-lg text-lg text-pretty text-muted-foreground">
            Envy encrypts your secrets on your machine. Your team and your CI get the same values
            with one command.
          </p>
          <div className="max-w-lg space-y-2.5">
            <CopyCommand command={INSTALL_COMMAND} />
            <p className="text-sm text-muted-foreground">
              macOS and Linux. On Windows, download it from the{" "}
              <a
                href={RELEASES_URL}
                className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
              >
                latest release
              </a>
              .
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              asChild
              size="lg"
              className="bg-brand px-4 text-brand-foreground hover:bg-brand/90"
            >
              <Link href="/docs#install">Get started</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="px-4">
              <a href="/projects">Open dashboard</a>
            </Button>
          </div>
        </div>
        <SealedEnv />
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <SectionIntro
            title="Set up once"
            text="Three commands, then everyone on the team has the same values."
          />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.command}
                className="flex flex-col rounded-lg border bg-card p-5 shadow-xs"
              >
                <span className="flex size-7 items-center justify-center rounded-md border font-mono text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-5 font-medium">{step.title}</h3>
                <p className="mt-1.5 flex-1 text-sm text-pretty text-muted-foreground">
                  {step.text}
                </p>
                <p className="scrollbar-none mt-5 overflow-x-auto">
                  <InlineCode className="whitespace-nowrap">{step.command}</InlineCode>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
          <SectionIntro
            title="Private by design"
            text="The server keeps your secrets safe for your team, but it cannot read them."
          />
          <div className="mt-12 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
            {FACTS.map((fact) => (
              <div key={fact.title} className="bg-card p-6 sm:p-8">
                <span className="flex size-9 items-center justify-center rounded-md border bg-muted text-foreground">
                  <fact.icon className="size-4.5" aria-hidden />
                </span>
                <h3 className="mt-5 font-medium">{fact.title}</h3>
                <p className="mt-1.5 max-w-sm text-sm text-pretty text-muted-foreground">
                  {fact.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:py-28">
          <SectionIntro
            title="Works where you already work"
            text="Your app, your CI and your teammates read the same values."
          />
          <Terminal />
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center sm:px-6 md:py-28">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">Ready in a minute</h2>
          <p className="mt-3 text-muted-foreground">
            Install the CLI, then run <InlineCode>envy login</InlineCode>.
          </p>
          <CopyCommand command={INSTALL_COMMAND} className="mt-8 w-full max-w-lg text-left" />
          <Button asChild variant="outline" size="lg" className="mt-6 px-4">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}

function SectionIntro({ title, text }: { title: string; text: string }) {
  return (
    <div className="max-w-xl space-y-2">
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      <p className="text-pretty text-muted-foreground">{text}</p>
    </div>
  );
}

/** The hero picture: the same .env as you see it, and as the server stores it. */
function SealedEnv() {
  return (
    <div
      role="img"
      aria-label="A .env file on your machine with readable values, and what the server stores: the same names with encrypted values it cannot read."
      className="min-w-0 overflow-hidden rounded-xl border bg-card font-mono text-xs shadow-xs sm:text-sm"
    >
      <PaneTitle title=".env on your machine" note="Readable" />
      <ul className="divide-y divide-border/70">
        {SEALED_ROWS.map((row) => (
          <SealedRow key={row.name} name={row.name}>
            <span className="text-foreground">{row.value}</span>
          </SealedRow>
        ))}
      </ul>
      <div className="flex items-center gap-3 border-y bg-muted/50 px-4 py-3 font-sans">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand ring-1 ring-brand/25">
          <Lock className="size-3.5" />
        </span>
        <span className="text-xs text-muted-foreground">Encrypted with your team&apos;s keys</span>
      </div>
      <PaneTitle title="What the server stores" note="Encrypted" />
      <ul className="divide-y divide-border/70">
        {SEALED_ROWS.map((row) => (
          <SealedRow key={row.name} name={row.name}>
            <span className="text-muted-foreground">{row.sealed}</span>
          </SealedRow>
        ))}
      </ul>
    </div>
  );
}

function PaneTitle({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5 font-sans">
      <span className="text-xs font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </div>
  );
}

function SealedRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 px-4 py-2">
      <span className="shrink-0 text-foreground">{name}</span>
      <span className="shrink-0 text-muted-foreground">=</span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

function Terminal() {
  return (
    <div
      aria-label="Example terminal session"
      role="img"
      className="min-w-0 overflow-hidden rounded-xl border border-code-border bg-code text-code-foreground shadow-md"
    >
      <div className="flex items-center gap-1.5 border-b border-code-border px-4 py-3">
        <span className="size-2.5 rounded-full bg-code-muted/40" />
        <span className="size-2.5 rounded-full bg-code-muted/40" />
        <span className="size-2.5 rounded-full bg-code-muted/40" />
        <span className="ml-3 font-mono text-xs text-code-muted">~/acme</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-sm leading-6">
        <Line command="envy init" />
        <Output>Linked to my-app. Imported 12 variables.</Output>
        {"\n"}
        <Line command="envy pull --env staging" />
        <Output>Pulled 14 variables from staging → .env</Output>
        {"\n"}
        <Line command="envy run -- npm start" />
        <span className="text-code-muted">{"> ready on http://localhost:3000\n"}</span>
      </pre>
    </div>
  );
}

function Line({ command }: { command: string }) {
  return (
    <span>
      <span className="text-code-muted">$ </span>
      <span className="text-code-foreground">{command}</span>
      {"\n"}
    </span>
  );
}

function Output({ children }: { children: string }) {
  return (
    <span className="text-code-foreground/80">
      <Check className="mr-2 inline size-3.5 align-[-2px] text-success" aria-hidden />
      {children}
      {"\n"}
    </span>
  );
}

import Link from "next/link";
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
    title: "Encrypted before it leaves",
    text: "Secrets are locked on your machine. The server only stores data it can't read.",
  },
  {
    title: "Nothing on disk",
    text: "envy run starts your app with the variables set. No .env file needed.",
  },
  {
    title: "Works in CI",
    text: "Make a read-only token for one environment and set it as ENVY_TOKEN.",
  },
  {
    title: "Every change saved",
    text: "Each push is a new version. See what changed and roll back in one command.",
  },
];

export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto grid max-w-5xl grid-cols-1 items-center gap-12 px-4 py-20 md:grid-cols-[1fr_minmax(0,26rem)] md:py-28">
        <div className="min-w-0 space-y-6">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            Share .env files with your team.
          </h1>
          <p className="max-w-md text-lg text-muted-foreground">
            Envy encrypts your secrets on your machine. Your team and your CI get the same values
            with one command.
          </p>
          <div className="max-w-lg space-y-2">
            <CopyCommand command={INSTALL_COMMAND} />
            <p className="text-sm text-muted-foreground">
              macOS and Linux. On Windows, download it from the{" "}
              <a href={RELEASES_URL} className="underline underline-offset-4">
                latest release
              </a>
              .
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild size="lg">
              <Link href="/docs">Read the docs</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/projects">Open dashboard</Link>
            </Button>
          </div>
        </div>
        <Terminal />
      </section>

      <section className="border-t">
        <div className="mx-auto max-w-5xl px-4 py-20">
          <h2 className="text-2xl font-semibold tracking-tight">Set up once</h2>
          <ol className="mt-10 grid gap-10 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.command} className="space-y-2">
                <p className="font-mono text-sm text-muted-foreground">{index + 1}</p>
                <h3 className="font-medium">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.text}</p>
                <code className="inline-block rounded-md bg-muted px-2 py-1 font-mono text-[13px]">
                  {step.command}
                </code>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t">
        <div className="mx-auto grid max-w-5xl gap-x-12 gap-y-8 px-4 py-20 sm:grid-cols-2">
          {FACTS.map((fact) => (
            <div key={fact.title} className="space-y-1.5">
              <h3 className="font-medium">{fact.title}</h3>
              <p className="text-sm text-muted-foreground">{fact.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Terminal() {
  return (
    <div
      aria-label="Example terminal session"
      role="img"
      className="min-w-0 overflow-hidden rounded-xl border bg-zinc-950 text-zinc-300 shadow-sm"
    >
      <div className="flex gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6">
        <Line command="envy init" />
        <Output>Linked to my-app. Imported 12 variables.</Output>
        {"\n"}
        <Line command="envy pull --env staging" />
        <Output>Pulled 14 variables from staging → .env</Output>
        {"\n"}
        <Line command="envy run -- npm start" />
        <span className="text-zinc-500">{"> ready on http://localhost:3000\n"}</span>
      </pre>
    </div>
  );
}

function Line({ command }: { command: string }) {
  return (
    <span>
      <span className="text-zinc-500">$ </span>
      <span className="text-zinc-100">{command}</span>
      {"\n"}
    </span>
  );
}

function Output({ children }: { children: string }) {
  return (
    <span>
      <span className="text-emerald-400">✔ </span>
      {children}
      {"\n"}
    </span>
  );
}

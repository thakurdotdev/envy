import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { InlineCode } from "@/components/inline-code";
import { CopyCommand } from "@/components/site/copy-command";
import { Features } from "@/components/site/landing/features";
import { KeyChain } from "@/components/site/landing/key-chain";
import { SecretJourney } from "@/components/site/landing/secret-journey";
import { ServerView } from "@/components/site/landing/server-view";
import { Workflow } from "@/components/site/landing/workflow";
import { GITHUB_URL, INSTALL_COMMAND, RELEASES_URL } from "@/components/site/links";
import { Button } from "@/components/ui/button";

const THREAT_MODEL_URL = `${GITHUB_URL}/blob/main/docs/threat-model.md`;

export default function LandingPage() {
  return (
    <main>
      <Hero />

      <Section
        id="how-it-works"
        label="How it works"
        title="Five commands cover most days."
        text="Set it up once per project. After that you mostly run envy run, and envy pull when something changes."
      >
        <Workflow />
      </Section>

      <Section
        id="security"
        label="Security"
        title="Built so the server can't read your secrets."
        text="Envy holds your team's variables, but only in a form it can't open. Here is exactly what it knows, and where the protection stops."
      >
        <ServerView />
      </Section>

      <Section
        id="keys"
        label="Under the hood"
        title="Four keys, each one unlocking the next."
        text={
          <>
            All of it uses libsodium, a widely used and audited crypto library. No home-made crypto.
            The{" "}
            <a
              href={THREAT_MODEL_URL}
              className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
            >
              threat model
            </a>{" "}
            has the details.
          </>
        }
      >
        <KeyChain />
      </Section>

      <Section
        id="features"
        label="Also in the box"
        title="The parts you'd build yourself, done."
        text="Small things that matter once a team, a staging server and a CI pipeline all need the same values."
      >
        <Features />
      </Section>

      <FinalCall />
    </main>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden">
      <div className="mx-auto max-w-6xl px-4 pt-14 pb-20 sm:px-6 md:pt-20 md:pb-24">
        <div className="max-w-5xl">
          <h1 className="text-[2.375rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance sm:text-6xl md:text-7xl">
            <span className="block">One .env for the whole team.</span>
            <span className="block text-muted-foreground">Unreadable to everyone else.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-pretty text-muted-foreground">
            Envy is a command-line tool that keeps your team&apos;s environment variables in sync.
            You push a change, your teammates and your CI pull it. Values are encrypted on your
            machine first, so the server that stores them can&apos;t read them.
          </p>
        </div>

        <div className="mt-9 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center">
          <CopyCommand command={INSTALL_COMMAND} className="min-w-0 flex-1" />
          <Button
            asChild
            size="lg"
            className="h-11 bg-brand px-4 text-brand-foreground hover:bg-brand/90"
          >
            <Link href="/docs">
              Read the docs
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          For macOS and Linux. Windows:{" "}
          <a
            href={RELEASES_URL}
            className="text-foreground underline decoration-border underline-offset-4 transition-colors hover:decoration-foreground"
          >
            download the .exe
          </a>
          . Then run <InlineCode>envy login</InlineCode>.
        </p>

        <div className="mt-16 md:mt-20">
          <SecretJourney />
        </div>
      </div>
    </section>
  );
}

function Section({
  id,
  label,
  title,
  text,
  children,
}: {
  id: string;
  label: string;
  title: string;
  text: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-14 border-t">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
        <div className="mb-12 grid gap-4 md:mb-16 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12">
          <div>
            <p className="font-mono text-xs text-brand">{label}</p>
            <h2
              id={`${id}-title`}
              className="mt-3 text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl"
            >
              {title}
            </h2>
          </div>
          <p className="max-w-xl self-end text-pretty text-muted-foreground md:text-lg md:leading-8">
            {text}
          </p>
        </div>
        {children}
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="border-t">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-12 md:py-28">
        <div>
          <h2 className="text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
            Try it on one project.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-muted-foreground">
            It takes about a minute. Your .env files stay where they are, and you can stop using
            Envy at any time with <InlineCode>envy pull</InlineCode>.
          </p>
        </div>
        <ol className="space-y-3 self-end">
          <Step number={1} text="Install the CLI">
            <CopyCommand command={INSTALL_COMMAND} />
          </Step>
          <Step number={2} text="Sign in with GitHub and pick a master password">
            <CopyCommand command="envy login" />
          </Step>
          <Step number={3} text="Link the project in its folder">
            <CopyCommand command="envy init" />
          </Step>
        </ol>
      </div>
    </section>
  );
}

function Step({ number, text, children }: { number: number; text: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 gap-y-2">
      <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{number}</span>
      <span className="text-sm">{text}</span>
      <span aria-hidden />
      {children}
    </li>
  );
}

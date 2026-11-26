import { InlineCode } from "@/components/inline-code";
import type { ReactNode } from "react";

const FEATURES: { title: string; text: ReactNode }[] = [
  {
    title: "Environments, plus a shared layer",
    text: (
      <>
        development, staging and production to start. Put values every environment needs in{" "}
        <InlineCode>shared</InlineCode> and set them once.
      </>
    ),
  },
  {
    title: "Every save is a version",
    text: (
      <>
        See who changed what with <InlineCode>envy history</InlineCode>. A rollback saves the old
        version again, so nothing is deleted.
      </>
    ),
  },
  {
    title: "No lost changes",
    text: "If a teammate pushed after your last pull, envy asks before replacing their version. In CI it stops instead.",
  },
  {
    title: "Monorepos",
    text: "envy init finds your workspace folders. Each app gets its own .env and its own environments.",
  },
  {
    title: "Access per environment",
    text: "Give a contractor development only. They never receive the keys to anything else.",
  },
  {
    title: "Read-only CI tokens",
    text: "One environment, an expiry date, and revoke at once. Only a hash of the token is kept on the server.",
  },
  {
    title: "A web dashboard",
    text: "Edit values, invite people and read the audit log in the browser. It decrypts in the page, like the CLI.",
  },
  {
    title: "envy doctor",
    text: "Checks your sign-in, the project link and your access, and spots keys in .env.example that nobody has set.",
  },
];

/** Smaller things worth knowing, in a dense grid instead of big cards. */
export function Features() {
  return (
    <dl className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {FEATURES.map((feature) => (
        <div key={feature.title} className="bg-card p-6">
          <dt className="font-medium">{feature.title}</dt>
          <dd className="mt-2 text-sm leading-6 text-pretty text-muted-foreground">
            {feature.text}
          </dd>
        </div>
      ))}
    </dl>
  );
}

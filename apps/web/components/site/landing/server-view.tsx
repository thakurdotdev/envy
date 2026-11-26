import { Eye, EyeOff } from "lucide-react";
import type { ReactNode } from "react";

// Checked against apps/api/src/db/schema.ts: a version row holds one
// ciphertext plus who saved it, the note and the time. Names live inside it.
const SERVER_SEES = [
  "Project, environment and app names",
  "Who is on the team: GitHub name, email and role",
  "When each version was saved, by whom, and the note you added",
  "How big each encrypted block is",
];

const SERVER_CANNOT_READ = [
  "Your variable values",
  "Your variable names, which sit inside the same sealed block",
  "Your master password and your recovery key",
  "Your private key and the secret half of every CI token",
];

// From docs/threat-model.md. Said plainly so nobody has to find it there.
const LIMITS = [
  {
    title: "Removed people keep old copies",
    text: "Removing someone gives every environment they could read a new key, so they can't open new values. Anything they already pulled, they still have. Envy reminds you to change those real credentials.",
  },
  {
    title: "Your laptop is part of the system",
    text: "Malware running as you can read what you can read. Envy keeps your keys in the system keychain, and envy logout removes them.",
  },
  {
    title: "No recovery without you",
    text: "If you lose both your master password and your recovery key, nobody can read your copy, including us. An admin can give you access again.",
  },
  {
    title: "Compare the codes",
    text: "When someone joins, you both see a short code. If they match, a server can't slip in a key of its own. Skip the check and you are trusting the server.",
  },
];

export function ServerView() {
  return (
    <div className="space-y-16">
      <div className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2">
        <KnowledgeList
          icon={<Eye className="size-4" aria-hidden />}
          title="The server can see"
          items={SERVER_SEES}
        />
        <KnowledgeList
          icon={<EyeOff className="size-4" aria-hidden />}
          title="The server can't read"
          items={SERVER_CANNOT_READ}
          strong
        />
      </div>

      <div>
        <h3 className="text-lg font-semibold tracking-tight">Limits worth knowing</h3>
        <dl className="mt-6 grid gap-x-12 gap-y-8 sm:grid-cols-2">
          {LIMITS.map((limit) => (
            <div key={limit.title} className="border-l-2 border-border pl-4">
              <dt className="font-medium">{limit.title}</dt>
              <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">{limit.text}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function KnowledgeList({
  icon,
  title,
  items,
  strong = false,
}: {
  icon: ReactNode;
  title: string;
  items: string[];
  strong?: boolean;
}) {
  return (
    <div className="bg-card p-6 sm:p-8">
      <p className="flex items-center gap-2.5 font-medium">
        <span
          className={
            strong
              ? "flex size-7 items-center justify-center rounded-md bg-brand/10 text-brand ring-1 ring-brand/20"
              : "flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground ring-1 ring-border"
          }
        >
          {icon}
        </span>
        {title}
      </p>
      <ul className="mt-5 space-y-3 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span
              aria-hidden
              className={
                strong
                  ? "mt-2 size-1 shrink-0 rounded-full bg-brand"
                  : "mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60"
              }
            />
            <span className={strong ? "text-foreground" : "text-muted-foreground"}>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

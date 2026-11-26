import { KeyRound, Lock } from "lucide-react";
import type { ReactNode } from "react";

// Made-up demo values, not real keys.
const VARIABLES = [
  { name: "DATABASE_URL", value: "postgres://localhost:5432/acme" },
  { name: "STRIPE_KEY", value: "sk_test_demo_51Hx" },
  { name: "RESEND_API_KEY", value: "re_demo_8fK2" },
  { name: "SENTRY_DSN", value: "https://demo@o1.ingest.sentry.io/1" },
  { name: "LOG_LEVEL", value: "info" },
];

// Looks like what the server stores (base64 of one sealed block), but it is
// not the output of any real key.
const SEALED_BLOCK =
  "AZ3kq9Vf0Lw2mR8xYc1Tn6uHsJ4bE7pQ0dXg5aKzW3vNf8Ls2Mh1Ry9Uc6Tq4Bo0Ia7Ge5Xk2Dn8Wp3Ft6Zj1Cv9Hs4Ql0Ym7Ob2Ev5Ru8Kx3Ai6Gn1Td4Mw9Sb0Pf7Jc2Lh5Uz8Vy3Ne6Qo1Rk4Xa9Is0Dm7Wg2Bt5Hv8";

/**
 * The hero picture: one environment on your laptop, on the server, and on a
 * teammate's laptop. The middle panel is the point of the product: the server
 * holds one sealed block per version and knows only who saved it and when.
 */
export function SecretJourney() {
  return (
    <figure
      aria-label="How Envy moves your variables. On your laptop the .env is readable. Envy encrypts it there and the server stores one sealed block it has no key for. On a teammate's laptop or in CI it is opened with their own key and is readable again."
      className="grid grid-cols-1 items-stretch gap-0 lg:grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)_3.5rem_minmax(0,1fr)]"
    >
      <Station
        place="Your laptop"
        file="~/acme/.env"
        command="envy push"
        caption="You keep a normal .env. Envy encrypts it here, before anything is uploaded."
      >
        <VariableList />
      </Station>

      <Hop icon={<Lock className="size-3.5" aria-hidden />} text="Locked on your machine" />

      <Station
        place="Envy's server"
        file="development · version 8"
        command="no key to open it"
        caption="One sealed block per version. The server can't read the names or the values in it."
        sealed
      >
        <div className="px-4 py-3.5">
          <p className="font-mono text-[0.75rem] leading-5 break-all text-muted-foreground/80 select-none">
            {SEALED_BLOCK}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-dashed px-4 py-3 text-xs">
          <dt className="text-muted-foreground">Saved by</dt>
          <dd>@you, 2 minutes ago</dd>
          <dt className="text-muted-foreground">Names</dt>
          <dd>inside the block</dd>
          <dt className="text-muted-foreground">Values</dt>
          <dd>inside the block</dd>
        </dl>
      </Station>

      <Hop icon={<KeyRound className="size-3.5" aria-hidden />} text="Opened with Sam's own key" />

      <Station
        place="Sam's laptop, or CI"
        file="~/acme/.env"
        command="envy run -- npm run dev"
        caption="Teammates and CI open it with their own key and get exactly what you pushed."
      >
        <VariableList />
      </Station>
    </figure>
  );
}

function Station({
  place,
  file,
  command,
  caption,
  sealed = false,
  children,
}: {
  place: string;
  file: string;
  command: string;
  caption: string;
  sealed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <p className="mb-2.5 flex items-center gap-2 text-sm font-medium">
        <span
          aria-hidden
          className={sealed ? "size-1.5 rounded-full bg-brand" : "size-1.5 rounded-full bg-success"}
        />
        {place}
      </p>
      <div
        className={
          sealed
            ? "flex flex-1 flex-col overflow-hidden rounded-xl border border-dashed border-foreground/20 bg-muted/40"
            : "flex flex-1 flex-col overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_0_oklch(0_0_0/0.04),0_8px_24px_-16px_oklch(0_0_0/0.18)]"
        }
      >
        <div className="flex items-center justify-between gap-3 border-b px-4 py-2 font-mono text-[0.7rem] text-muted-foreground">
          <span className="truncate">{file}</span>
        </div>
        <div className="flex-1">{children}</div>
        <div className="border-t px-4 py-2 font-mono text-[0.7rem] text-muted-foreground">
          {sealed ? <span>{command}</span> : <span>$ {command}</span>}
        </div>
      </div>
      <p className="mt-3 text-sm text-pretty text-muted-foreground">{caption}</p>
    </div>
  );
}

function VariableList() {
  return (
    <ul className="divide-y divide-border/60 font-mono text-[0.75rem] leading-5">
      {VARIABLES.map((variable) => (
        <li key={variable.name} className="flex min-w-0 px-4 py-2">
          <span className="shrink-0">{variable.name}</span>
          <span className="shrink-0 text-muted-foreground">=</span>
          <span className="min-w-0 truncate text-muted-foreground">{variable.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** The step between two places: a short line with an icon and a label. */
function Hop({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="relative flex items-center justify-center py-5 lg:py-0 lg:pb-14">
      <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-border lg:hidden" />
      <span
        aria-hidden
        className="absolute top-[calc(50%-1.75rem)] right-0 left-0 hidden h-px bg-border lg:block"
      />
      <span className="relative flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground lg:size-8 lg:justify-center lg:p-0">
        <span className="text-brand">{icon}</span>
        <span className="lg:sr-only">{text}</span>
      </span>
    </div>
  );
}

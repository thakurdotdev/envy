import { cn } from "@/lib/utils";

type KeyDiff = { added: string[]; changed: string[]; removed: string[] };

const KINDS = {
  added: { mark: "+", tone: "text-success" },
  changed: { mark: "~", tone: "text-warning" },
  removed: { mark: "−", tone: "text-destructive" },
} as const;

export type DiffLineKind = keyof typeof KINDS;

/** Every name in a keys-only diff, in the order added, changed, removed. */
export function diffLines(diff: KeyDiff): { key: string; kind: DiffLineKind }[] {
  return [
    ...diff.added.map((key) => ({ key, kind: "added" as const })),
    ...diff.changed.map((key) => ({ key, kind: "changed" as const })),
    ...diff.removed.map((key) => ({ key, kind: "removed" as const })),
  ];
}

/** One name in a diff: a coloured +, ~ or − mark, then the name. Screen readers hear the word. */
export function DiffLine({ name, kind }: { name: string; kind: DiffLineKind }) {
  const { mark, tone } = KINDS[kind];
  return (
    <li className="flex gap-2">
      <span aria-hidden className={cn("w-2.5 shrink-0 font-semibold", tone)}>
        {mark}
      </span>
      <span className="min-w-0 truncate">{name}</span>
      <span className="sr-only">({kind})</span>
    </li>
  );
}

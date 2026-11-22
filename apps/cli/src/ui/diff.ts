import pc from "picocolors";

export type KeyDiff = {
  added: string[];
  changed: string[];
  removed: string[];
};

/** Which keys were added, changed or removed going from `before` to `after`. */
export function diffKeys(before: Record<string, string>, after: Record<string, string>): KeyDiff {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];
  for (const [key, value] of Object.entries(after)) {
    if (!Object.hasOwn(before, key)) {
      added.push(key);
    } else if (before[key] !== value) {
      changed.push(key);
    }
  }
  for (const key of Object.keys(before)) {
    if (!Object.hasOwn(after, key)) {
      removed.push(key);
    }
  }
  return { added: added.toSorted(), changed: changed.toSorted(), removed: removed.toSorted() };
}

export function isEmptyDiff(diff: KeyDiff): boolean {
  return diff.added.length === 0 && diff.changed.length === 0 && diff.removed.length === 0;
}

/** Key names only, never values: `+ STRIPE_KEY  ~ DATABASE_URL  − OLD_FLAG`. */
export function formatDiff(diff: KeyDiff): string {
  const parts = [
    ...diff.added.map((key) => pc.green(`+ ${key}`)),
    ...diff.changed.map((key) => pc.yellow(`~ ${key}`)),
    ...diff.removed.map((key) => pc.red(`− ${key}`)),
  ];
  return parts.join("  ");
}

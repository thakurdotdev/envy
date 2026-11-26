"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLoad } from "@/hooks/use-load";
import { pullEnvironment, type EnvironmentSummary } from "@/lib/envy";
import { useUnlocked } from "@/lib/session";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

type Inherited = { key: string; value: string; from: string; overridden: boolean };

/**
 * The values this environment gets from the layers under it (shared, and
 * the root stage for an app), read only. A key the environment sets itself
 * is shown as overridden, because its own value wins.
 */
export function InheritedVariables({
  projectId,
  layers,
  ownKeys,
}: {
  projectId: string;
  /** Lowest first. */
  layers: EnvironmentSummary[];
  ownKeys: string[];
}) {
  const { keys } = useUnlocked();
  const { state } = useLoad(
    () => Promise.all(layers.map((layer) => pullEnvironment(keys, projectId, layer))),
    [layers.map((layer) => layer.id).join(",")],
  );
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set());
  if (layers.length === 0 || state.status !== "ready") {
    return null;
  }

  // Later layers win, so walk them in order and let each replace the last.
  const byKey = new Map<string, Omit<Inherited, "overridden">>();
  for (const [index, layer] of layers.entries()) {
    const from = layer.isShared ? "shared" : `root ${layer.name}`;
    for (const [key, value] of Object.entries(state.data[index]?.secrets ?? {})) {
      byKey.set(key, { key, value, from });
    }
  }
  const items: Inherited[] = [...byKey.values()]
    .map((item) => ({ ...item, overridden: ownKeys.includes(item.key) }))
    .toSorted((first, second) => first.key.localeCompare(second.key));
  const names = layers.map((layer) => (layer.isShared ? "shared" : `the root's ${layer.name}`));

  return (
    <section aria-label="Inherited variables" className="space-y-2">
      <h3 className="text-sm font-medium">Inherited ({items.length})</h3>
      <p className="text-xs text-muted-foreground">
        From {names.join(" and ")}. Your app gets these too; a variable set above with the same name
        wins. Change them in their own tab.
      </p>
      {items.length === 0 ? null : (
        <ul className="divide-y rounded-lg border bg-muted/30">
          {items.map((item) => {
            const isRevealed = revealed.has(item.key);
            return (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm"
              >
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate font-mono",
                    item.overridden ? "text-muted-foreground line-through" : "text-foreground",
                  )}
                >
                  {item.key}
                </span>
                <span className="max-w-[40%] truncate font-mono text-muted-foreground">
                  {isRevealed ? item.value : "••••••••"}
                </span>
                <StatusBadge>{item.overridden ? "set here" : `from ${item.from}`}</StatusBadge>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${isRevealed ? "Hide" : "Show"} inherited ${item.key}`}
                  onClick={() =>
                    setRevealed((current) => {
                      const next = new Set(current);
                      if (isRevealed) {
                        next.delete(item.key);
                      } else {
                        next.add(item.key);
                      }
                      return next;
                    })
                  }
                >
                  {isRevealed ? <EyeOff /> : <Eye />}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

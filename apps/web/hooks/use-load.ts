"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";

export type LoadState<Data> =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: Data; refreshing: boolean };

// Answers kept between pages, so going back to a page shows it at once while
// it loads again in the background. Only for data that is not secret (names,
// members, tokens): decrypted values are never put here. Cleared on lock and
// sign-out, so nothing outlives the unlocked session.
const cache = new Map<string, unknown>();

export function clearLoadCache(): void {
  cache.clear();
}

/** Drops cached answers whose key starts with this text, so the next visit loads fresh. */
export function forgetCached(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Runs `load` when the inputs change, with loading and error states and a
 * reload function. Reloading keeps the current data on screen (with
 * `refreshing: true`) instead of going back to a skeleton, so forms and
 * one-time values below it are not thrown away.
 *
 * With `cacheKey`, the last answer is shown immediately on the next visit.
 */
export function useLoad<Data>(
  load: () => Promise<Data>,
  inputs: unknown[],
  options: { cacheKey?: string } = {},
) {
  const { cacheKey } = options;
  const [state, setState] = useState<LoadState<Data>>(() => initialState<Data>(cacheKey));
  // The inputs decide when to reload; `load` itself changes on every render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, inputs);
  // Only the newest request may update the state, so a slow old answer
  // cannot replace a newer one.
  const latestRequest = useRef(0);
  const hasData = useRef(state.status === "ready");
  useEffect(() => {
    hasData.current = state.status === "ready";
  }, [state.status]);

  const reload = useCallback(() => {
    const request = latestRequest.current + 1;
    latestRequest.current = request;
    setState((current) =>
      current.status === "ready" ? { ...current, refreshing: true } : { status: "loading" },
    );
    void (async () => {
      try {
        const data = await run();
        if (latestRequest.current !== request) {
          return;
        }
        if (cacheKey !== undefined) {
          cache.set(cacheKey, data);
        }
        setState({ status: "ready", data, refreshing: false });
      } catch (error) {
        if (latestRequest.current !== request) {
          return;
        }
        const message = errorMessage(error);
        if (hasData.current) {
          // Keep showing what we have; just say the refresh failed.
          toast.error(message);
        }
        setState((current) =>
          current.status === "ready"
            ? { ...current, refreshing: false }
            : { status: "error", message },
        );
      }
    })();
  }, [run, cacheKey]);

  useEffect(() => {
    // New inputs: show their cached answer (or a skeleton), then load.
    setState(initialState<Data>(cacheKey));
    reload();
  }, [reload, cacheKey]);

  return { state, reload };
}

function initialState<Data>(cacheKey: string | undefined): LoadState<Data> {
  if (cacheKey !== undefined && cache.has(cacheKey)) {
    // Each key is written only by the hook that reads it, always with the same Data type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const data = cache.get(cacheKey) as Data;
    return { status: "ready", data, refreshing: true };
  }
  return { status: "loading" };
}

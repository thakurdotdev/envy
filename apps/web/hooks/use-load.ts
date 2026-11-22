"use client";

import { useCallback, useEffect, useState } from "react";
import { errorMessage } from "@/lib/api";

export type LoadState<Data> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: Data };

/** Runs `load` when the inputs change, with loading and error states and a reload function. */
export function useLoad<Data>(load: () => Promise<Data>, inputs: unknown[]) {
  const [state, setState] = useState<LoadState<Data>>({ status: "loading" });
  // The inputs decide when to reload; `load` itself changes on every render.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, inputs);

  const reload = useCallback(() => {
    setState({ status: "loading" });
    run().then(
      (data) => setState({ status: "ready", data }),
      (error: unknown) => setState({ status: "error", message: errorMessage(error) }),
    );
  }, [run]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { state, reload };
}

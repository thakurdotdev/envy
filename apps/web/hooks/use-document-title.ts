"use client";

import { useEffect } from "react";

/** Sets the browser tab title, so tabs and history entries say which page they are. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    document.title = title === undefined ? "Envy" : `${title} · Envy`;
  }, [title]);
}

"use client";

import { useEffect } from "react";

const QUESTION = "You have unsaved changes. Leave this page and lose them?";

/**
 * Asks before unsaved edits are lost: on reload or closing the tab (the
 * browser's own prompt), and on links inside the dashboard. A link click is
 * caught before Next.js handles it, so "Cancel" keeps the user on the page.
 */
export function useUnsavedChangesWarning(hasUnsavedChanges: boolean): void {
  useEffect(() => {
    if (!hasUnsavedChanges) {
      return undefined;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    function onClick(event: MouseEvent) {
      const isPlainClick =
        event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!isPlainClick || !(link instanceof HTMLAnchorElement) || link.target === "_blank") {
        return;
      }
      const isSamePage =
        link.origin === window.location.origin &&
        link.pathname === window.location.pathname &&
        link.search === window.location.search;
      if (!isSamePage && !window.confirm(QUESTION)) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("click", onClick, { capture: true });
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("click", onClick, { capture: true });
    };
  }, [hasUnsavedChanges]);
}

"use client";

import { useEffect, useState } from "react";

// Shared between the org-level dashboard sidebar (src/components/dashboard/sidebar.tsx)
// and the company workspace sidebar (src/components/companies/company-sidebar.tsx).
// They're two different layouts but the same conceptual "shell", so using one
// storage key means collapsing the sidebar in one place stays collapsed when
// the user moves to the other.
const STORAGE_KEY = "ledger:sidebar-collapsed";

/**
 * Collapsed/expanded state for the primary app sidebar, persisted across
 * reloads via localStorage.
 *
 * SSR (and the very first client render, for hydration) always reports
 * `isCollapsed: false` — there's no way to know the stored preference until
 * we're in the browser. Once mounted, an effect reads localStorage and
 * updates state; `hydrated` flips to true at the same time so callers can
 * skip the width transition on that one update (otherwise a returning user
 * who left the sidebar collapsed would see it flash open then animate shut).
 */
export function useSidebarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setIsCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      // Storage can be unavailable (private browsing, disabled cookies,
      // etc.) — fall back to the default expanded state.
    }
    setHydrated(true);
  }, []);

  // Keep other mounted instances (the two sidebars aren't rendered at the
  // same time, but multiple tabs can be) in sync when the preference
  // changes elsewhere.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === STORAGE_KEY) {
        setIsCollapsed(event.newValue === "1");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function toggle() {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // Non-fatal — the toggle still works for the current session.
      }
      return next;
    });
  }

  return { isCollapsed, toggle, hydrated };
}

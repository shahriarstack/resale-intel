"use client";

import { useCallback } from "react";
import { usePersistedJSON } from "@/lib/usePersisted";
import { BUILTIN_VIEWS, type SavedView } from "./types";

const NONE: SavedView[] = [];

/**
 * Per-desk saved views, persisted in localStorage.
 *
 * Keyed by desk so a user who covers two roles does not see one desk's views
 * on the other. Built-ins are prepended at read time rather than stored, so
 * improving them in a later release reaches everyone instead of only new
 * users.
 */
export function useSavedViews(deskKey: string) {
  const [custom, persist] = usePersistedJSON<SavedView[]>(`ri:views:${deskKey}`, NONE);

  // A hand-edited or half-written key must not take the desk down.
  const safe = Array.isArray(custom) ? custom : NONE;

  const save = useCallback(
    (view: Omit<SavedView, "id" | "builtin">) => {
      const id = `v${Date.now().toString(36)}`;
      persist([...safe, { ...view, id }]);
      return id;
    },
    [safe, persist],
  );

  const remove = useCallback(
    (id: string) => persist(safe.filter((v) => v.id !== id)),
    [safe, persist],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      persist(safe.map((v) => (v.id === id ? { ...v, name } : v))),
    [safe, persist],
  );

  return {
    views: [...BUILTIN_VIEWS, ...safe],
    custom: safe,
    save,
    remove,
    rename,
  };
}

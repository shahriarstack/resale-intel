"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Read/write a localStorage value as a React external store.
 *
 * Reading storage in an effect and calling setState is the obvious approach
 * and the wrong one: it renders once with the default, then again with the
 * real value, and React 19 flags the cascade. localStorage is an external
 * store, so useSyncExternalStore is what it is for — one render, no cascade.
 *
 * Two details make it work:
 *  - getSnapshot must be referentially stable for unchanged data, or React
 *    re-renders forever. Parsed values are therefore cached against the raw
 *    string they came from.
 *  - the `storage` event only fires in *other* tabs, so writes here also
 *    notify local subscribers. That gives cross-tab sync for free: change the
 *    theme in one tab and every other tab follows.
 */

interface Entry {
  raw: string | null;
  value: unknown;
}

const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function read<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    // Site data blocked. Behave as if nothing was stored.
    return fallback;
  }

  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;

  let value: T;
  if (raw === null) {
    value = fallback;
  } else {
    try {
      value = parse(raw);
    } catch {
      value = fallback;
    }
  }
  cache.set(key, { raw, value });
  return value;
}

export function write(key: string, raw: string | null): void {
  try {
    if (raw === null) localStorage.removeItem(key);
    else localStorage.setItem(key, raw);
  } catch {
    // Not persisting is survivable — the in-memory cache below still drives
    // this session, the preference just will not outlive it.
  }
  cache.delete(key);
  emit();
}

/**
 * A JSON-encoded persisted value.
 *
 * `serverValue` is what the server and the first client render both see, so
 * markup matches; the real stored value is adopted on the client's first
 * commit without an extra render pass.
 */
export function usePersistedJSON<T>(key: string, fallback: T): [T, (v: T) => void] {
  const getSnapshot = useCallback(
    () => read<T>(key, fallback, (raw) => JSON.parse(raw) as T),
    [key, fallback],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((v: T) => write(key, JSON.stringify(v)), [key]);

  return [value, set];
}

/**
 * A plain-string persisted value constrained to a known set. Anything not in
 * `allowed` is treated as absent, so a stale or hand-edited key cannot put the
 * UI into a state it has no styling for.
 */
export function usePersistedEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): [T, (v: T) => void] {
  // Memoised so getSnapshot stays stable across renders.
  const allowedKey = useMemo(() => allowed.join("|"), [allowed]);

  const getSnapshot = useCallback(
    () =>
      read<T>(key, fallback, (raw) =>
        (allowedKey.split("|") as T[]).includes(raw as T) ? (raw as T) : fallback,
      ),
    [key, fallback, allowedKey],
  );
  const getServerSnapshot = useCallback(() => fallback, [fallback]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const set = useCallback((v: T) => write(key, v), [key]);

  return [value, set];
}

"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Back, without the trapdoor.
 *
 * `router.back()` on its own is one of those calls that works every time you
 * test it and fails for the person who matters. It walks the BROWSER's history
 * — not the app's — so it only does what the word says when there is somewhere
 * in this app to go back TO. When there is not, it does one of three things,
 * none of them "go back":
 *
 *   installed to a home screen   the app is its own window with one entry, and
 *                                back CLOSES IT. This product ships
 *                                `display: standalone`, so this is the normal
 *                                case for the field roles, not an edge one.
 *   a shared link                somebody opens a vehicle from a message; back
 *                                leaves for whatever was on screen before.
 *   a new tab                    nothing happens at all, which reads as a dead
 *                                control.
 *
 * So this counts. Every in-app navigation bumps a depth held in
 * `sessionStorage` — per tab, cleared with it — and back is only a history move
 * when that depth says there is an app page underneath. Otherwise it goes to
 * the parent route, which is the honest answer to "back" on the first page you
 * were shown: not the previous website, and not nothing.
 *
 * `sessionStorage` rather than `history.length`: that counts entries from
 * before this app was opened too, so a phone browser with a long history says
 * "yes, go back" and leaves the product entirely.
 */
const KEY = "ri:trail";

interface Trail {
  /** The last path counted. Guards against counting one arrival twice. */
  last: string;
  depth: number;
}

function trail(): Trail {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Trail) : { last: "", depth: 0 };
  } catch {
    // Private windows and locked-down site data throw on access. A back
    // control that falls through to its parent route is not broken, just less
    // clever, so this is a default rather than a failure.
    return { last: "", depth: 0 };
  }
}

/**
 * Call once per in-app navigation. Mounted by the shell.
 *
 * COUNTS PATHS, NOT CALLS, and it has to: React runs effects twice in
 * development, so a plain `depth + 1` recorded two entries for the first page
 * of a fresh tab. That is not a dev-only cosmetic — it made `depth > 1` true
 * with nothing behind, so Back called `router.back()` on the opening page and
 * landed on `about:blank`: precisely the trapdoor this module exists to close,
 * reintroduced by the counter meant to detect it. Storing the last path makes
 * the count idempotent, whatever re-runs the effect.
 */
export function noteNavigation(path: string) {
  try {
    const t = trail();
    if (t.last === path) return;
    sessionStorage.setItem(KEY, JSON.stringify({ last: path, depth: t.depth + 1 }));
  } catch {
    /* see above */
  }
}

export function useGoBack(fallback: string) {
  const router = useRouter();

  // Read AT THE CLICK, not at mount. Nothing about the control's appearance
  // depends on the answer — it says "Back" either way — so there is no reason
  // to hold it in state, and holding it would mean rendering a decision made
  // before the reader had navigated anywhere else. Reading it late also gets
  // `sessionStorage` off the server render entirely.
  return useCallback(() => {
    if (trail().depth > 1) router.back();
    else router.push(fallback);
  }, [fallback, router]);
}

/**
 * The control itself.
 *
 * A button, not a link, and that is deliberate: it is not a link to the
 * fallback — it is a link to WHERE YOU CAME FROM, which is usually the list
 * you had scrolled and filtered, and only falls back to the parent when there
 * is no such place. Labelling it with the parent route would promise the wrong
 * destination most of the time.
 */
export function BackLink({
  to,
  label = "Back",
  className = "",
}: {
  /** Where back means when there is no history — the parent screen. */
  to: string;
  label?: string;
  className?: string;
}) {
  const go = useGoBack(to);
  return (
    <button type="button" onClick={go} className={`back-link ${className}`}>
      <ChevronLeft size={13} />
      {label}
    </button>
  );
}

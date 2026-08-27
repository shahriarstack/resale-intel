"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";
import { usePersistedEnum } from "@/lib/usePersisted";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_KEY = "ri:theme";
const CHOICES = ["light", "dark", "system"] as const;

/**
 * The script that runs before first paint.
 *
 * It has to be inlined and synchronous: if the attribute lands after
 * hydration the user sees a white flash on every navigation into a dark
 * session. Kept dependency-free and wrapped in try/catch because a browser
 * with site data blocked throws on localStorage access rather than returning
 * null, and a throw here would take the whole document with it.
 */
export const themeInitScript = `
(function(){
  try {
    var c = localStorage.getItem(${JSON.stringify(THEME_KEY)}) || "system";
    var d = c === "dark" || (c === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", d ? "dark" : "light");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
`;

interface ThemeContextValue {
  /** What the user picked — may be "system". */
  choice: ThemeChoice;
  /** What that resolves to right now. */
  resolved: ResolvedTheme;
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  choice: "system",
  resolved: "light",
  setChoice: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/* ---- OS preference, read as an external store ---- */

function subscribeToOS(onChange: () => void): () => void {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function osPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Light on the server: it is the tested fallback, and the inline script has
 *  already corrected the document by the time this matters. */
function osServerSnapshot(): boolean {
  return false;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [choice, setChoice] = usePersistedEnum<ThemeChoice>(THEME_KEY, CHOICES, "system");
  const systemDark = useSyncExternalStore(subscribeToOS, osPrefersDark, osServerSnapshot);

  const resolved: ResolvedTheme =
    choice === "system" ? (systemDark ? "dark" : "light") : choice;

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolved);
    // Keep the mobile browser chrome in step with the page ground.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", resolved === "dark" ? "#090913" : "#f4f4f9");
  }, [resolved]);

  const value = useMemo(
    () => ({ choice, resolved, setChoice }),
    [choice, resolved, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

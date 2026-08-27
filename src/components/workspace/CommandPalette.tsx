"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Search,
  Truck,
  CornerDownLeft,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Loader2,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { getNavItems } from "@/components/shell/navConfig";
import { useTheme } from "@/components/theme/ThemeProvider";
import { statusLabel } from "@/lib/status";
import { vehicleTitle } from "@/lib/vehicle";
import type { VehicleStatus } from "@prisma/client";

interface VehicleHit {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  customerName: string;
  status: VehicleStatus;
}

interface Command {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

/**
 * Global command palette, opened with Ctrl/Cmd+K.
 *
 * Two sources feed it: static commands built from the same nav config the
 * sidebar uses (so it can never offer a route the role does not have), and
 * live vehicle search hit against the existing role-scoped list endpoint.
 * Search is debounced because it runs per keystroke against the database.
 */
export function CommandPalette({ role }: { role: Role }) {
  const router = useRouter();
  const { setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<VehicleHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setHits([]);
    setCursor(0);
  }, []);

  // Open / close on the global chord.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      // Focus after the entry animation starts so the caret does not jump.
      const t = setTimeout(() => inputRef.current?.focus(), 20);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounced vehicle search.
  //
  // Nothing is set synchronously here: the loading flag is raised inside the
  // debounce callback, and a query too short to search simply leaves the last
  // results in state — the items memo below decides what is actually shown.
  // That keeps the effect free of the setState cascade React 19 warns about.
  useEffect(() => {
    const q = query.trim();
    if (!open || q.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/vehicles?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("search failed");
        // Standard API envelope: { success, data }.
        const body = (await res.json()) as { data?: VehicleHit[] };
        setHits((body.data ?? []).slice(0, 6));
      } catch (err) {
        if ((err as Error).name !== "AbortError") setHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  const commands = useMemo<Command[]>(() => {
    const nav = getNavItems(role).map((item) => ({
      id: `nav:${item.href}`,
      group: "Go to",
      label: item.label,
      icon: <item.icon size={16} />,
      run: () => {
        router.push(item.href);
        close();
      },
    }));

    const theme: Command[] = [
      {
        id: "theme:light",
        group: "Theme",
        label: "Switch to light",
        icon: <Sun size={16} />,
        run: () => {
          setChoice("light");
          close();
        },
      },
      {
        id: "theme:dark",
        group: "Theme",
        label: "Switch to dark",
        icon: <Moon size={16} />,
        run: () => {
          setChoice("dark");
          close();
        },
      },
      {
        id: "theme:system",
        group: "Theme",
        label: "Match system theme",
        icon: <Monitor size={16} />,
        run: () => {
          setChoice("system");
          close();
        },
      },
    ];

    const account: Command[] = [
      {
        id: "acct:signout",
        group: "Account",
        label: "Sign out",
        icon: <LogOut size={16} />,
        run: () => {
          close();
          signOut({ callbackUrl: "/login" });
        },
      },
    ];

    return [...nav, ...theme, ...account];
  }, [role, router, setChoice, close]);

  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [commands, query]);

  // Vehicles first when the user is clearly searching for one. Results from a
  // previous, longer query must not linger once the box is cleared back below
  // the search threshold, so the cut happens inside the memo.
  const items = useMemo<Command[]>(() => {
    const shownHits = query.trim().length >= 2 ? hits : [];
    const vehicleCommands: Command[] = shownHits.map((v) => ({
      id: `veh:${v.id}`,
      group: "Vehicles",
      label: vehicleTitle(v),
      hint: `${v.registrationNo} · ${v.customerName} · ${statusLabel(v.status)}`,
      icon: <Truck size={16} />,
      run: () => {
        router.push(`/vehicles/${v.id}`);
        close();
      },
    }));
    return [...vehicleCommands, ...filteredCommands];
  }, [query, hits, filteredCommands, router, close]);

  // Clamp rather than correct-in-an-effect: results change under the cursor on
  // every keystroke, and derived state cannot fall out of step the way a
  // stored index corrected after the fact can.
  const active = items.length ? Math.min(cursor, items.length - 1) : 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor(items.length ? (active + 1) % items.length : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor(items.length ? (active - 1 + items.length) % items.length : 0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  // Scroll the cursor into view when it moves off screen.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-on="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <>
      <div className="cmdk-scrim" onClick={close} aria-hidden />
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="relative">
          <Search
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <input
            ref={inputRef}
            className="cmdk-input"
            placeholder="Search vehicles, or jump to a page…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
          />
          {loading && (
            <Loader2
              size={15}
              className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-ink-3"
            />
          )}
        </div>

        <div className="cmdk-list" ref={listRef}>
          {items.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[13px] text-ink-2">
                {query.trim().length >= 2
                  ? `Nothing matches "${query.trim()}"`
                  : "Type to search"}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-3">
                Vehicles, customers, registration numbers
              </p>
            </div>
          ) : (
            items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <div key={item.id}>
                  {header && <div className="cmdk-group">{header}</div>}
                  <button
                    className="cmdk-item"
                    data-on={i === active}
                    onMouseEnter={() => setCursor(i)}
                    onClick={item.run}
                  >
                    <span className="shrink-0 text-ink-3">{item.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold text-ink">
                        {item.label}
                      </span>
                      {item.hint && (
                        <span className="block truncate font-mono text-[11px] text-ink-3">
                          {item.hint}
                        </span>
                      )}
                    </span>
                    {i === active && (
                      <CornerDownLeft size={13} className="shrink-0 text-ink-3" />
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-rule bg-surface-2 px-3 py-2">
          <Hint keys={["↑", "↓"]} label="navigate" />
          <Hint keys={["↵"]} label="open" />
          <Hint keys={["esc"]} label="close" />
        </div>
      </div>
    </>
  );
}

function Hint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {keys.map((k) => (
        <kbd key={k} className="kbd">
          {k}
        </kbd>
      ))}
      <span className="font-mono text-[10px] text-ink-3">{label}</span>
    </span>
  );
}

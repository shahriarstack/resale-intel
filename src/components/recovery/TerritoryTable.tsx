"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  Filter,
  FileClock,
  Flag,
  MailWarning,
  MapPin,
  Moon,
  Plus,
  Search,
  Timer,
  X,
  type LucideIcon,
} from "lucide-react";
import { takaCompact } from "@/lib/format";
import type { TerritoryAnalytics, TerritoryRow } from "@/lib/recoveryRollup";
import { NumberField } from "@/components/ui/NumberField";

/**
 * Territory-wise summary — and, because a territory here is one officer's
 * patch, the only place this desk needs to look to know who to ring.
 *
 * Read DOWN a column to rank territories; read ACROSS a row to see what kind
 * of trouble one is in; OPEN a row to see exactly what is pending and whose
 * move it is. That third one is the reason this table stopped being a wall of
 * numbers.
 *
 * Four choices a reader should know about:
 *
 *  - **Pending work is split by whose move it is, not by type.** Five separate
 *    exception columns told a manager there were six problems here; they never
 *    told them that four were sitting in their own inbox and two were the
 *    officer's. That distinction is the whole difference between "clear this
 *    screen" and "make a phone call", so it is the first thing the cell says.
 *
 *  - **The types are glyphs, not more columns.** Five icons in one cell is a
 *    thing you scan; five more numeric columns is a thing you stop reading.
 *    Every glyph carries its full sentence in the expanded row and in its
 *    tooltip, so nothing is hidden behind an icon that is only available as
 *    an icon.
 *
 *  - **Off-road total carries an inline bar.** It is the headline figure and
 *    the only one where relative magnitude matters more than the number.
 *
 *  - **The totals row is pinned to the bottom and never sorts.** It is not a
 *    territory, and sorting it into the middle of the ranking makes the table
 *    unreadable.
 */

/** One kind of outstanding work, and who has to do something about it. */
const TASKS: {
  key: "pendingRequests" | "support" | "lettersLate" | "overdue" | "stale";
  owner: "you" | "officer";
  icon: LucideIcon;
  short: string;
  /** What it is, and what clearing it looks like. */
  detail: string;
  href: string;
}[] = [
  {
    key: "pendingRequests",
    owner: "you",
    icon: FileClock,
    short: "Capture requests",
    detail: "Raised from this patch and waiting on your ruling. The officer cannot move until you decide.",
    href: "/capture-requests",
  },
  {
    key: "support",
    owner: "you",
    icon: Flag,
    short: "Wants your attention",
    detail: "The officer has asked HQ for something and cannot move the case without it.",
    href: "/offroad",
  },
  {
    key: "lettersLate",
    owner: "officer",
    icon: MailWarning,
    short: "Letters late",
    detail: "The notice ladder has slipped. Every day late is a day the Credit Note cannot be requested.",
    href: "/letter-watch",
  },
  {
    key: "overdue",
    owner: "officer",
    icon: Timer,
    short: "Past their window",
    detail: "Open cases that have run past the estimate the officer gave when they opened them.",
    href: "/offroad",
  },
  {
    key: "stale",
    owner: "officer",
    icon: Moon,
    short: "Gone quiet",
    detail: "Open, unflagged, never revised, and nothing has happened for a fortnight. Nobody is working these.",
    href: "/offroad",
  },
];

type SortKey =
  | "captureSpend"
  | "captured"
  | "accident"
  | "thana"
  | "offroadTotal"
  | "resale"
  | "needsYou"
  | "needsOfficer"
  | "avgDays"
  | "oldestDays"
  | "letter1"
  | "letter2"
  | "letter3"
  | "written"
  | "noLetter"
  | "locked"
  | "activeFiles"
  | "totalFiles";

/**
 * The column bands, in the order this desk needs them.
 *
 * `openByDefault: false` is the whole reason the coverage board could be folded
 * in here without the table becoming unreadable. A band that is shut renders as
 * a single narrow strip with a count on it; opening one is a click, and the
 * choice sticks for the session. The RM's own work — what is outstanding and
 * on whom — is open on arrival; the ladder and the file counts are reference,
 * and reference should be reachable rather than always underfoot.
 */
const GROUPS = [
  { key: "action", label: "Needs attention", openByDefault: true },
  { key: "load", label: "To recover", openByDefault: true },
  { key: "age", label: "Age", openByDefault: true },
  { key: "ladder", label: "Notice ladder", openByDefault: false },
  { key: "stock", label: "Stock & files", openByDefault: false },
] as const;

type GroupKey = (typeof GROUPS)[number]["key"];

const COLUMNS: {
  key: SortKey;
  label: string;
  short: string;
  group: GroupKey;
  suffix?: string;
  /** Render as taka rather than a bare count. */
  money?: boolean;
}[] = [
  {
    key: "needsOfficer",
    label:
      "Waiting on the field officer: letters late, cases past their window, cases gone quiet. Cleared by a phone call.",
    short: "Needs officer",
    group: "action",
  },
  {
    key: "needsYou",
    label:
      "Waiting on this desk: capture requests to rule on, and officers who have asked HQ for something. Cleared here.",
    short: "Needs RM",
    group: "action",
  },
  { key: "captured", label: "Seized — letters running or Credit Note pending", short: "Captured", group: "load" },
  { key: "accident", label: "Open accident cases", short: "Accident", group: "load" },
  { key: "thana", label: "Open custody cases", short: "Thana", group: "load" },
  { key: "offroadTotal", label: "Still to be recovered — captured + accident + custody", short: "Off-road", group: "load" },
  {
    key: "resale",
    label: "Past the Credit Note — stock on its way to a sale, not a recovery case",
    short: "Resale",
    group: "stock",
  },
  { key: "avgDays", label: "Mean days off the road, open cases", short: "Avg age", group: "age", suffix: "d" },
  { key: "oldestDays", label: "Longest-running open case", short: "Oldest", group: "age", suffix: "d" },

  // ---- Merged in from the territory-wise coverage board ----
  { key: "noLetter", label: "Captured, notice ladder not yet started", short: "No letter", group: "ladder" },
  { key: "letter1", label: "First notice served", short: "L1", group: "ladder" },
  { key: "letter2", label: "Second notice served", short: "L2", group: "ladder" },
  { key: "letter3", label: "Third notice served", short: "L3", group: "ladder" },
  { key: "written", label: "Written off — the ladder has run its course", short: "Written", group: "ladder" },
  { key: "locked", label: "Release is shut: Letter 3 served or written off", short: "Locked", group: "ladder" },
  { key: "activeFiles", label: "Files still moving through the eight-desk chain", short: "Active", group: "stock" },
  { key: "totalFiles", label: "Every vehicle on this patch still on the books", short: "Files", group: "stock" },
  // Field spend, filed with the other background readings rather than up front:
  // it is something the desk reviews, not something it acts on today. It is
  // also the one column here that is not part of any cost basis — see the note
  // on Vehicle.captureCost.
  {
    key: "captureSpend",
    label:
      "What this territory spent taking vehicles — agent and transport on the day. A record only: it reaches no repair budget, SOP or resale price.",
    short: "Capture spend",
    group: "stock",
    money: true,
  },
];



const OPS = [">", ">=", "=", "<=", "<"] as const;

interface ColFilter {
  op: (typeof OPS)[number];
  value: number;
}

/** One filter per column, as a spreadsheet does it. */
type FilterMap = Partial<Record<SortKey, ColFilter>>;

const sortValue = (r: TerritoryRow, key: SortKey): number => r[key] ?? -1;

/**
 * Who is reading.
 *
 * `desk` is the Recovery Manager, for whom the left-hand column of pending
 * work is genuinely their own inbox and every queue is one click away.
 * `observer` is business management: the same rows, but the work belongs to
 * somebody else and none of those queues will open for them — so they are
 * told whose it is and given no links that would dead-end at /dashboard.
 */
export type TerritoryViewer = "desk" | "observer";

export function TerritoryTable({
  data,
  viewer = "desk",
}: {
  data: TerritoryAnalytics;
  viewer?: TerritoryViewer;
}) {
  const [sort, setSort] = useState<SortKey>("needsOfficer");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [bands, setBands] = useState<Record<GroupKey, boolean>>(
    () => Object.fromEntries(GROUPS.map((g) => [g.key, g.openByDefault])) as Record<GroupKey, boolean>,
  );

  const openBand = (g: GroupKey) => setBands((b) => ({ ...b, [g]: !b[g] }));

  /**
   * Row filters, one per column, opened from the column's own header.
   *
   * The spreadsheet arrangement, because this table is read the way a
   * spreadsheet is: you are looking at a column, you decide it is the thing
   * you want to narrow by, and the control is already there. A single filter
   * button elsewhere on the page makes you name the column you are pointing
   * at, which is a translation step between having the thought and acting on
   * it.
   *
   * Filters across columns are ANDed. One per column, also as a spreadsheet
   * does it — two conditions on the same column is a range, and a desk that
   * needs one can say `>= 2` on off-road and read the rest off the sort.
   */
  const [filters, setFilters] = useState<FilterMap>({});

  /**
   * The territory column's own filter: a set of chosen names.
   *
   * A value list rather than an operator, because the first column is not a
   * measurement — "territory >= 2" is meaningless. This is the filter the
   * desk reaches for most: a part-wise manager wants their eight patches and
   * nothing else, and picking them once beats typing a search that also
   * matches an officer's name. Empty means every territory, so the filter has
   * no effect until somebody actually chooses.
   */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [terrMenu, setTerrMenu] = useState<{ x: number; y: number } | null>(null);
  const [terrQuery, setTerrQuery] = useState("");

  const openTerrMenu = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTerrQuery("");
    setTerrMenu({ x: Math.min(r.left, window.innerWidth - 270), y: r.bottom + 6 });
  };
  const togglePicked = (name: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  /**
   * Which column's popover is open, and where to put it.
   *
   * Anchored with a fixed position measured off the button rather than
   * absolutely inside the header cell: the table body is a scroll container,
   * and anything absolutely positioned inside it is clipped at the first
   * edge. Fixed escapes that, at the cost of having to close on scroll —
   * which is the trade every table with a header menu makes.
   */
  const [menu, setMenu] = useState<{ key: SortKey; x: number; y: number } | null>(null);
  // The draft holds its threshold as a string so the box can be emptied and
  // retyped; it is turned into a number only when the filter is applied.
  const [draft, setDraft] = useState<{ op: ColFilter["op"]; value: string }>({ op: ">=", value: "1" });

  const openMenu = (key: SortKey, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const f = filters[key];
    setDraft(f ? { op: f.op, value: String(f.value) } : { op: ">=", value: "1" });
    setMenu({ key, x: Math.min(r.left, window.innerWidth - 250), y: r.bottom + 6 });
  };
  const applyFilter = () => {
    if (!menu) return;
    setFilters((f) => ({ ...f, [menu.key]: { op: draft.op, value: Number(draft.value) || 0 } }));
    setMenu(null);
  };
  const clearFilter = (key: SortKey) =>
    setFilters((f) => {
      const next = { ...f };
      delete next[key];
      return next;
    });

  // A menu pinned to a viewport coordinate has to go when the page moves
  // under it, or it points at the wrong column.
  useEffect(() => {
    if (!menu && !terrMenu) return;
    const close = () => {
      setMenu(null);
      setTerrMenu(null);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu, terrMenu]);



  const activeFilters = useMemo(
    () => Object.entries(filters) as [SortKey, ColFilter][],
    [filters],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const active = Object.entries(filters) as [SortKey, ColFilter][];
    const matches = (r: TerritoryRow) =>
      (picked.size === 0 || picked.has(r.territory)) &&
      active.every(([key, f]) => {
        const v = r[key];
        // A null age on a territory with no open cases is "no reading", not
        // zero — it must not satisfy "avg age is under 5".
        if (v === null || v === undefined) return false;
        switch (f.op) {
          case ">":
            return v > f.value;
          case ">=":
            return v >= f.value;
          case "=":
            return v === f.value;
          case "<=":
            return v <= f.value;
          case "<":
            return v < f.value;
        }
      });

    const base = q
      ? data.rows.filter(
          (r) =>
            r.territory.toLowerCase().includes(q) ||
            r.aros.some(
              (a) =>
                a.name.toLowerCase().includes(q) || a.staffId.toLowerCase().includes(q),
            ),
        )
      : data.rows;
    return [...base.filter(matches)].sort((a, b) =>
      dir === "desc"
        ? sortValue(b, sort) - sortValue(a, sort)
        : sortValue(a, sort) - sortValue(b, sort),
    );
  }, [data.rows, sort, dir, query, filters, picked]);

  // Past roughly a dozen rows the table stops being something you take in at
  // once and becomes something you scroll. At that point the headings have to
  // stay put, or every row below the fold is a row of unlabelled numbers.
  const tall = data.rows.length > 12;

  const toggle = (key: SortKey) => {
    if (key === sort) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSort(key);
      setDir("desc");
    }
  };

  if (data.rows.length === 0) {
    return (
      <div className="card grid place-items-center gap-2 px-6 py-12 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-3">
          <MapPin size={19} strokeWidth={1.7} />
        </span>
        <p className="text-[13px] text-ink-2">Nothing off the road in any territory.</p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      {/* Finder. At fifty territories, hunting for one by eye down a sorted
          column is the slowest thing on this page — and sorting to find it
          throws away the ranking you were reading. */}
      {/* The toolbar is always here — which columns you want has nothing to do
          with how many rows there are. The finder inside it does: below a
          dozen territories you can see them all, and a search box over six
          rows is furniture. */}
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
        {tall ? (
          <div className="pill-search h-8 w-[260px]">
            <span className="grid h-8 w-9 shrink-0 place-items-center text-ink-3">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a territory or officer…"
              aria-label="Find a territory"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear"
                className="mr-2 grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
              >
                <X size={12} />
              </button>
            )}
          </div>
        ) : (
          <span />
        )}
          <div className="flex items-center gap-3">
            <span className="font-mono text-[10px] text-ink-3">
              {rows.length === data.rows.length
                ? `${data.rows.length} territories`
                : `${rows.length} of ${data.rows.length}`}
            </span>

          </div>
      </div>

      {/* What is currently applied, and the way out of it. A filter you cannot
          see is a filter that has you reading a subset believing it is the
          book. */}
      {(activeFilters.length > 0 || picked.size > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-rule px-3 py-2">
          {picked.size > 0 && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1"
              style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
            >
              <span className="text-[11.5px] font-semibold">
                {picked.size === 1
                  ? [...picked][0]
                  : `${picked.size} territories`}
              </span>
              <button
                onClick={() => setPicked(new Set())}
                aria-label="Clear the territory filter"
                className="grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-surface"
              >
                <X size={10} />
              </button>
            </span>
          )}
          {activeFilters.map(([key, f]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full py-1 pl-2.5 pr-1"
              style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}
            >
              <span className="text-[11.5px] font-semibold">
                {COLUMNS.find((c) => c.key === key)?.short} {f.op} {f.value}
              </span>
              <button
                onClick={() => clearFilter(key)}
                aria-label={`Remove the ${COLUMNS.find((c) => c.key === key)?.short} filter`}
                className="grid h-4 w-4 place-items-center rounded-full transition-colors hover:bg-surface"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          <button
            className="ml-1 font-mono text-[10px] text-ink-3 transition-colors hover:text-accent"
            onClick={() => {
              setFilters({});
              setPicked(new Set());
            }}
          >
            clear all
          </button>
          <span className="ml-auto font-mono text-[10px] text-ink-3">
            {rows.length} of {data.rows.length} territories
          </span>
        </div>
      )}

      <div className={`tt-scroll overflow-auto${tall ? " tt-scroll-tall" : ""}`}>
        <table className="tt-table w-full min-w-[900px] border-collapse text-left">
          <thead>
            {/* Two header rows: the segments are grouped, and a reader who
                cannot see the grouping reads nine unrelated numbers. */}
            <tr className="tt-band border-b border-rule">
              <th className="px-3 py-1.5" />
              {GROUPS.map((g) => {
                const count = COLUMNS.filter((c) => c.group === g.key).length;
                const isOpen = bands[g.key];
                return (
                  <th
                    key={g.key}
                    colSpan={isOpen ? count : 1}
                    className="border-l border-rule px-2 py-1.5"
                  >
                    <button
                      onClick={() => openBand(g.key)}
                      aria-expanded={isOpen}
                      title={
                        isOpen
                          ? `Hide the ${g.label.toLowerCase()} columns`
                          : `Show ${count} ${g.label.toLowerCase()} column${count === 1 ? "" : "s"}`
                      }
                      className="flex w-full items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-surface-2"
                      style={{ color: g.key === "action" ? "var(--warn)" : "var(--ink-3)" }}
                    >
                      <ChevronDown
                        size={10}
                        className="shrink-0 transition-transform"
                        style={isOpen ? undefined : { transform: "rotate(-90deg)" }}
                      />
                      <span className="label !mb-0 truncate text-[9px]" style={{ color: "inherit" }}>
                        {isOpen ? g.label : g.label.split(" ")[0]}
                      </span>
                      {!isOpen && (
                        <span
                          className="ml-auto rounded-full px-1 font-mono text-[8.5px] font-bold"
                          style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
                        >
                          {count}
                        </span>
                      )}
                    </button>
                  </th>
                );
              })}
              <th className="px-2 py-1.5" />
            </tr>
            <tr className="tt-cols border-b border-rule-strong">
              <th
                className="sticky left-0 z-10 px-3 py-2 align-bottom"
                style={{
                  background:
                    picked.size > 0
                      ? "color-mix(in srgb, var(--accent) 7%, var(--surface))"
                      : "var(--surface)",
                }}
              >
                <span className="flex items-center gap-1">
                  <span className="label !mb-0 text-[9.5px]">Territory</span>
                  <button
                    onClick={(e) => openTerrMenu(e.currentTarget)}
                    aria-label="Filter by territory"
                    title={
                      picked.size > 0
                        ? `Showing ${picked.size} chosen territor${picked.size === 1 ? "y" : "ies"}`
                        : "Filter by territory"
                    }
                    className="tt-funnel"
                    data-on={picked.size > 0 || undefined}
                  >
                    <Filter size={9.5} />
                  </button>
                </span>
              </th>
              {/* Band by band, so a shut band keeps its place in the row
                  rather than jumping to the end of the table. */}
              {GROUPS.map((g) => {
                if (!bands[g.key]) {
                  return (
                    <th key={g.key} className="border-l border-rule px-2 py-2 align-bottom">
                      <button
                        onClick={() => openBand(g.key)}
                        title={`Show the ${g.label.toLowerCase()} columns`}
                        className="mx-auto grid h-5 w-5 place-items-center rounded text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
                        aria-label={`Show the ${g.label.toLowerCase()} columns`}
                      >
                        <Plus size={11} />
                      </button>
                    </th>
                  );
                }
                return COLUMNS.filter((c) => c.group === g.key).map((c, i) => {
                  const on = sort === c.key;
                  const filtered = !!filters[c.key];
                  return (
                    <th
                      key={c.key}
                      title={c.label}
                      aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`px-3 py-2 align-bottom ${i === 0 ? "border-l border-rule" : ""}`}
                      style={
                        filtered
                          ? { background: "color-mix(in srgb, var(--accent) 7%, var(--surface))" }
                          : undefined
                      }
                    >
                      <span className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => toggle(c.key)}
                          className="flex min-w-0 items-center justify-end gap-1 text-right"
                          style={{ color: on ? "var(--accent)" : "var(--ink-3)" }}
                        >
                          <span className="label !mb-0 truncate text-[9.5px]" style={{ color: "inherit" }}>
                            {c.short}
                          </span>
                          {on ? (
                            dir === "desc" ? (
                              <ArrowDown size={11} />
                            ) : (
                              <ArrowUp size={11} />
                            )
                          ) : (
                            <ChevronsUpDown size={11} className="opacity-40" />
                          )}
                        </button>
                        {/* The column's own filter, where a spreadsheet puts
                            it. Lit when the column is carrying one, so a
                            narrowed table says which column narrowed it
                            without anybody reading the chips. */}
                        <button
                          onClick={(e) => openMenu(c.key, e.currentTarget)}
                          aria-label={`Filter by ${c.short}`}
                          title={
                            filtered
                              ? `Filtered: ${c.short} ${filters[c.key]!.op} ${filters[c.key]!.value}`
                              : `Filter by ${c.short}`
                          }
                          className="tt-funnel"
                          data-on={filtered || undefined}
                        >
                          <Filter size={9.5} />
                        </button>
                      </span>
                    </th>
                  );
                });
              })}
              <th className="px-2 py-2" />
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={40} className="px-3 py-10 text-center">
                  <p className="text-[13px] text-ink-2">
                    {query
                      ? `No territory matches "${query}".`
                      : "No territory matches these filters."}
                  </p>
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const expanded = open === r.territory;
              return (
                <TerritoryRows
                  key={r.territory}
                  row={r}
                  peak={data.peak}
                  bands={bands}
                                    viewer={viewer}
                  expanded={expanded}
                  onToggle={() => setOpen(expanded ? null : r.territory)}
                />
              );
            })}
          </tbody>

          <tfoot>
            <tr style={{ background: "var(--surface-2)" }}>
              <td
                className="sticky left-0 z-10 px-3 py-2 text-[12.5px] font-bold text-ink"
                style={{ background: "var(--surface-2)" }}
              >
                {data.total.territory}
              </td>
              <BandCells row={data.total} peak={data.peak} bands={bands} total />
              <td style={{ background: "var(--surface-2)" }} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* The territory value list. Fixed, for the same clipping reason as the
          numeric menu below. */}
      {terrMenu && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close the territory filter"
            onClick={() => setTerrMenu(null)}
          />
          <div
            className="fixed z-50 flex w-[256px] flex-col rounded-[var(--radius-lg)] border border-rule bg-surface shadow-[var(--shadow-lg)]"
            style={{ left: terrMenu.x, top: terrMenu.y }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
              <span className="label !mb-0 text-[9.5px]">Territory</span>
              <button
                className="font-mono text-[10px] text-accent disabled:text-ink-3"
                onClick={() => setPicked(new Set())}
                disabled={picked.size === 0}
              >
                clear
              </button>
            </div>

            <div className="border-b border-rule px-2 py-2">
              <input
                autoFocus
                className="field h-[28px] w-full px-2 text-[12px]"
                placeholder="Find a territory…"
                value={terrQuery}
                onChange={(e) => setTerrQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setTerrMenu(null)}
              />
            </div>

            <div className="max-h-64 overflow-y-auto py-1">
              {data.rows
                .filter((r) =>
                  r.territory.toLowerCase().includes(terrQuery.trim().toLowerCase()),
                )
                .map((r) => {
                  const on = picked.has(r.territory);
                  return (
                    <label
                      key={r.territory}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[12px] transition-colors hover:bg-surface-2"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => togglePicked(r.territory)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--accent)]"
                      />
                      <span className={on ? "truncate text-ink" : "truncate text-ink-2"}>
                        {r.territory}
                      </span>
                      {r.part && (
                        <span className="ml-auto font-mono text-[9px] text-ink-3">{r.part}</span>
                      )}
                    </label>
                  );
                })}
            </div>

            {/* Choosing every one is the same as choosing none, so the list
                offers the shortcut both ways rather than making someone tick
                fifty boxes to say "all of them". */}
            <div className="flex gap-1.5 border-t border-rule p-2">
              <button
                className="btn btn-ghost btn-sm flex-1"
                onClick={() => setPicked(new Set(data.rows.map((r) => r.territory)))}
              >
                Select all
              </button>
              <button className="btn btn-primary btn-sm flex-1" onClick={() => setTerrMenu(null)}>
                Done
              </button>
            </div>
          </div>
        </>
      )}

      {/* The column menu. Fixed rather than nested in the header cell, which
          the scroll container would clip. */}
      {menu && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close the filter"
            onClick={() => setMenu(null)}
          />
          <div
            className="fixed z-50 w-[236px] rounded-[var(--radius-lg)] border border-rule bg-surface p-3 shadow-[var(--shadow-lg)]"
            style={{ left: menu.x, top: menu.y }}
          >
            <span className="label !mb-1.5 block text-[9.5px]">
              {COLUMNS.find((c) => c.key === menu.key)?.short}
            </span>
            <div className="flex items-center gap-1.5">
              <select
                className="sf-select w-[64px] shrink-0"
                value={draft.op}
                onChange={(e) => setDraft((d) => ({ ...d, op: e.target.value as ColFilter["op"] }))}
              >
                {OPS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <NumberField
                autoFocus
                className="field h-[29px] min-w-0 flex-1 px-2 text-[12px] tnum"
                value={draft.value}
                onChange={(v) => setDraft((d) => ({ ...d, value: v }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilter();
                  if (e.key === "Escape") setMenu(null);
                }}
              />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {filters[menu.key] && (
                <button
                  className="btn btn-ghost btn-sm flex-1"
                  onClick={() => {
                    clearFilter(menu.key);
                    setMenu(null);
                  }}
                >
                  Clear
                </button>
              )}
              <button className="btn btn-primary btn-sm flex-1" onClick={applyFilter}>
                Apply
              </button>
            </div>
          </div>
        </>
      )}

      <p className="border-t border-rule px-3 py-2 text-[11px] leading-snug text-ink-3">
        Each territory is one officer&apos;s patch. Under{" "}
        <strong className="text-ink-2">Needs attention</strong>, the left half is waiting on{" "}
        {viewer === "desk" ? "you" : "the recovery desk"} and the right half is waiting on the
        officer — open a row for the breakdown
        {viewer === "desk" ? " and a way through to each queue" : ""}.
      </p>
    </div>
  );
}


/**
 * One row's numeric cells, laid out band by band.
 *
 * A shut band contributes exactly one empty cell so every row keeps the same
 * shape as the header — the alternative is a body that silently drifts out of
 * alignment with its own column headings the moment a band is closed.
 */
function BandCells({
  row,
  peak,
  bands,
  total,
}: {
  row: TerritoryRow;
  peak: number;
  bands: Record<GroupKey, boolean>;
  total?: boolean;
}) {
  return (
    <>
      {GROUPS.map((g) => {
        if (!bands[g.key]) {
          return (
            <td
              key={g.key}
              className="border-l border-rule px-2 py-2 text-center"
              style={total ? { background: "var(--surface-2)" } : undefined}
            >
              <span className="font-mono text-[10px] text-ink-3 opacity-50">·</span>
            </td>
          );
        }
        return COLUMNS.filter((c) => c.group === g.key).map((c, i) => (
          <Cell key={c.key} row={row} col={c} peak={peak} divider={i === 0} total={total} />
        ));
      })}
    </>
  );
}

/**
 * A territory and, when open, its detail panel.
 *
 * Two `<tr>`s rather than one tall cell: a detail panel nested inside a table
 * cell cannot span the table, and one that does not span reads as belonging to
 * whichever column it happens to sit under.
 */
function TerritoryRows({
  row,
  peak,
  bands,
  viewer,
  expanded,
  onToggle,
}: {
  row: TerritoryRow;
  peak: number;
  bands: Record<GroupKey, boolean>;
  viewer: TerritoryViewer;
  expanded: boolean;
  onToggle: () => void;
}) {
  const officer = row.aros[0] ?? null;
  const pending = row.needsYou + row.needsOfficer;

  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={expanded}
        className="cursor-pointer border-b border-rule transition-colors hover:bg-surface-2"
        style={expanded ? { background: "var(--surface-2)" } : undefined}
      >
        <td
          className="sticky left-0 z-10 px-3 py-2"
          style={{ background: expanded ? "var(--surface-2)" : "var(--surface)" }}
        >
          <span className="flex items-center gap-1.5">
            <span className="text-[12.5px] font-semibold text-ink">{row.territory}</span>
            {row.part && (
              <span
                title={`Recovery part ${row.part}`}
                className="rounded px-1 font-mono text-[8.5px] font-bold leading-[14px]"
                style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
              >
                {row.part}
              </span>
            )}
          </span>
          {/* The officer's name used to sit here. At fifty territories that
              was fifty lines of secondary text competing with fifty names,
              and the desk reads this table by territory. The name is in the
              expansion, where it is the thing you act on. */}
        </td>
        <BandCells row={row} peak={peak} bands={bands} />
        <td className="px-2 py-2 text-right">
          <ChevronDown
            size={14}
            className="inline-block text-ink-3 transition-transform"
            style={expanded ? { transform: "rotate(180deg)" } : undefined}
          />
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={GROUPS.reduce((n, g) => n + (bands[g.key] ? COLUMNS.filter((c) => c.group === g.key).length : 1), 2)} className="border-b border-rule p-0">
            <div className="px-3 py-3.5" style={{ background: "var(--surface-2)" }}>
              {pending === 0 ? (
                <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--ok)" }}>
                  <CheckCircle2 size={15} />
                  <span className="font-semibold">
                    Nothing outstanding in {row.territory}
                    {officer ? ` — ${officer.name.split(" ")[0]} is clear` : ""}.
                  </span>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <TaskGroup
                    row={row}
                    owner="you"
                    viewer={viewer}
                    heading={viewer === "desk" ? "Waiting on you" : "Waiting on the recovery desk"}
                    blurb={
                      viewer === "desk"
                        ? "Clear these here. Until you do, the officer cannot move."
                        : "Sitting in the recovery desk's inbox. The officer cannot move until it is cleared."
                    }
                  />
                  <TaskGroup
                    row={row}
                    owner="officer"
                    viewer={viewer}
                    heading={officer ? `Waiting on ${officer.name.split(" ")[0]}` : "Waiting on the field"}
                    blurb={
                      officer
                        ? `${officer.name} · ${officer.staffId}${viewer === "desk" ? " — this is the call to make." : ""}`
                        : "Nobody is posted here, so nobody is working these."
                    }
                  />
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** One side of the split: what this person owes, itemised, with a way through. */
function TaskGroup({
  row,
  owner,
  viewer,
  heading,
  blurb,
}: {
  row: TerritoryRow;
  owner: "you" | "officer";
  viewer: TerritoryViewer;
  heading: string;
  blurb: string;
}) {
  const items = TASKS.filter((t) => t.owner === owner && row[t.key] > 0);
  const tone = owner === "you" ? "var(--accent)" : "var(--bad)";
  // Business management cannot open any of these queues, so they get the same
  // itemisation without a link that would bounce them back to the dashboard.
  const linked = viewer === "desk";

  return (
    <div className="rounded-[var(--radius)] border border-rule bg-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-bold" style={{ color: tone }}>
          {heading}
        </span>
        <span className="font-mono text-[10px] text-ink-3">
          {owner === "you" ? row.needsYou : row.needsOfficer} outstanding
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{blurb}</p>

      {items.length === 0 ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--ok)" }}>
          Nothing on this side.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {items.map((t) => {
            const body = (
              <>
                <span
                  className="mt-px grid h-6 w-6 shrink-0 place-items-center rounded-lg"
                  style={{ background: `color-mix(in srgb, ${tone} 12%, transparent)`, color: tone }}
                >
                  <t.icon size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-mono text-[13px] font-bold tnum" style={{ color: tone }}>
                      {row[t.key]}
                    </span>
                    <span className="text-[12px] font-semibold text-ink">{t.short}</span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-ink-3">{t.detail}</span>
                </span>
                {linked && (
                  <ArrowRight
                    size={13}
                    className="mt-1 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100"
                  />
                )}
              </>
            );
            return (
              <li key={t.key}>
                {linked ? (
                  <Link
                    href={t.href}
                    onClick={(e) => e.stopPropagation()}
                    className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                  >
                    {body}
                  </Link>
                ) : (
                  <span className="flex items-start gap-2.5 rounded-lg px-2 py-1.5">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Cell({
  row,
  col,
  peak,
  divider,
  total,
}: {
  row: TerritoryRow;
  col: (typeof COLUMNS)[number];
  peak: number;
  divider: boolean;
  total?: boolean;
}) {
  const cls = `px-3 py-2 text-right ${divider ? "border-l border-rule" : ""}`;

  // The two attention cells. Each carries its own total AND the glyphs for
  // what makes it up, so a manager reading across the row sees both how much
  // is outstanding on each side and which kinds — without either becoming a
  // column of its own. Every glyph is written out in words in the expanded
  // row and repeated in the cell's tooltip.
  if (col.key === "needsYou" || col.key === "needsOfficer") {
    const owner = col.key === "needsYou" ? "you" : "officer";
    const tone = owner === "you" ? "var(--accent)" : "var(--bad)";
    const count = row[col.key];
    const chips = TASKS.filter((t) => t.owner === owner && row[t.key] > 0);

    if (count === 0) {
      return (
        <td className={cls}>
          <span className="font-mono text-[12.5px] tnum text-ink-3">·</span>
        </td>
      );
    }
    return (
      <td className={cls}>
        <span className="flex items-center justify-end gap-1.5">
          <span className="flex flex-wrap items-center justify-end gap-1">
            {chips.map((t) => (
              <span
                key={t.key}
                title={`${row[t.key]} · ${t.short} — ${t.detail}`}
                className="inline-flex items-center gap-0.5 rounded-full px-1 py-0.5"
                style={{
                  background: `color-mix(in srgb, ${tone} ${total ? 8 : 12}%, transparent)`,
                  color: tone,
                }}
              >
                <t.icon size={9} />
                <span className="font-mono text-[9.5px] font-bold tnum">{row[t.key]}</span>
              </span>
            ))}
          </span>
          <span
            className="font-mono text-[12.5px] tnum"
            style={{ color: tone, fontWeight: total ? 700 : 600 }}
          >
            {count}
          </span>
        </span>
      </td>
    );
  }

  const value = row[col.key];
  const n = typeof value === "number" ? value : null;
  const zero = n === null || n === 0;

  return (
    <td className={cls}>
      {col.key === "offroadTotal" ? (
        <span className="flex items-center justify-end gap-2">
          {/* The one bar on the table: relative magnitude is the reading that
              matters on the headline column, and nowhere else. */}
          <span
            className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full"
            style={{ background: "var(--surface-3)" }}
          >
            <span
              className="block h-full rounded-full"
              style={{
                width: peak > 0 ? `${Math.round(((n ?? 0) / peak) * 100)}%` : "0%",
                background: total ? "var(--ink-3)" : "var(--accent)",
              }}
            />
          </span>
          <span
            className="font-mono text-[12.5px] tnum"
            style={{ color: "var(--ink)", fontWeight: total ? 700 : 600 }}
          >
            {n ?? "—"}
          </span>
        </span>
      ) : (
        <span
          className="font-mono text-[12.5px] tnum"
          style={{ color: zero ? "var(--ink-3)" : "var(--ink)", fontWeight: total ? 700 : zero ? 400 : 600 }}
        >
          {n === null ? "—" : col.money ? takaCompact(n) : `${n}${col.suffix ?? ""}`}
        </span>
      )}
    </td>
  );
}

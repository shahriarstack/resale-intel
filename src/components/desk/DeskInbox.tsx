"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ArrowRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Inbox,
  Wallet,
  AlertTriangle,
  Hourglass,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Command,
  Rows3,
  Rows4,
  SearchX,
  MapPin,
  CalendarRange,
  X,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { SearchBar } from "@/components/ui/SearchBar";
import { PanelHero } from "@/components/ui/PanelHero";
import { StatTile } from "@/components/ui/StatTile";
import { LETTER_META } from "@/lib/status";
import { shortDate, taka, takaCompact } from "@/lib/format";
import { gradeSla, slaRank, summarise, type SlaLevel } from "@/lib/sla";
import { ActionModal, type PendingAction } from "@/components/vehicle/ActionModal";
import { accountTitle, vehicleTitle } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { DetailPane } from "@/components/workspace/DetailPane";
import { BulkBar } from "@/components/workspace/BulkBar";
import { useSavedViews } from "@/components/workspace/useSavedViews";
import { usePersistedEnum } from "@/lib/usePersisted";
import {
  EMPTY_FILTER,
  filterMatchesView,
  viewToFilter,
  type Column,
  DENSITIES,
  type Density,
  type FilterState,
  type QuickAction,
  type SavedView,
  type SortDir,
  type SortKey,
  type WorkspaceVehicle,
} from "@/components/workspace/types";

// Re-exported so the dashboard's existing imports keep resolving unchanged.
export type DeskVehicle = WorkspaceVehicle;
export type { QuickAction };

/** Files with no territory set still belong to somebody. */
const UNASSIGNED_TERRITORY = "Unassigned";

/**
 * A YYYY-MM-DD string as a local day boundary.
 *
 * Built from the parts rather than `new Date(string)`, which parses a bare
 * date as UTC midnight and would move the boundary by the timezone offset —
 * six hours in Dhaka, enough to silently include or drop a day's captures.
 */
function dayBound(v: string, endOfDay: boolean): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return endOfDay
    ? new Date(y, mo - 1, d, 23, 59, 59, 999)
    : new Date(y, mo - 1, d, 0, 0, 0, 0);
}

function matchSearch(v: WorkspaceVehicle, q: string): boolean {
  const s = q.toLowerCase();
  return (
    (v.make ?? "").toLowerCase().includes(s) ||
    (v.model ?? "").toLowerCase().includes(s) ||
    v.registrationNo.toLowerCase().includes(s) ||
    v.customerName.toLowerCase().includes(s) ||
    (v.capturedBy?.name ?? "").toLowerCase().includes(s) ||
    (v.assignedEngineer?.name ?? "").toLowerCase().includes(s) ||
    (v.territory?.name ?? "").toLowerCase().includes(s)
  );
}


/**
 * Column sort affordance. Defined at module scope rather than inside the
 * workspace: a component declared in a render body is a new type on every
 * render, so React unmounts and remounts it each time.
 */
function SortIcon({
  column,
  sortKey,
  sortDir,
}: {
  column: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
}) {
  if (sortKey !== column) {
    return (
      <ArrowUpDown
        size={11}
        className="ml-1 inline opacity-0 transition-opacity group-hover:opacity-60"
      />
    );
  }
  return sortDir === "asc" ? (
    <ArrowUp size={11} className="ml-1 inline text-accent" />
  ) : (
    <ArrowDown size={11} className="ml-1 inline text-accent" />
  );
}

/**
 * The shared desk workspace.
 *
 * Six approving roles render through this one component, so everything that
 * makes a desk usable — ageing, saved views, batch approval, split-pane
 * review, keyboard flow — is built once and every desk gets it. The props are
 * unchanged from the original inbox: each dashboard branch still passes a
 * title, its vehicles and its own quick actions, and the state machine in
 * rbac.ts remains the only thing that decides what those actions may do.
 */
export function DeskInbox({
  title,
  subtitle,
  vehicles,
  columns = ["letter"],
  quickActions = [],
  actionLabel = "Open",
  /** Namespaces saved views. Defaults to a slug of the desk title. */
  deskKey,
  /** Optional pipeline analytics, shown under the queue on oversight desks. */
  insight,
}: {
  title: string;
  subtitle: string;
  vehicles: WorkspaceVehicle[];
  columns?: Column[];
  quickActions?: QuickAction[];
  actionLabel?: string;
  deskKey?: string;
  insight?: React.ReactNode;
}) {
  const router = useRouter();
  const key = deskKey ?? title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const [pending, setPending] = useState<{ vehicleId: string; action: PendingAction } | null>(null);
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [activeView, setActiveView] = useState<string>("all");

  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState("");

  const [density, setDensity] = usePersistedEnum<Density>(
    `ri:density:${key}`,
    DENSITIES,
    "comfortable",
  );

  const { views, save, remove } = useSavedViews(key);
  const listRef = useRef<HTMLTableSectionElement>(null);

  // Grade every file once, then reuse. SLA drives the rail, the filters and
  // the default sort, so computing it per render branch would drift.
  const graded = useMemo(
    () =>
      vehicles.map((v) => ({
        v,
        sla: gradeSla(v.createdAt, v.repairDeadline ?? null),
      })),
    [vehicles],
  );

  const summary = useMemo(() => summarise(graded.map((g) => g.sla)), [graded]);

  /**
   * Territories present on this desk, with counts.
   *
   * Built from the queue itself rather than the master list, so a desk only
   * ever offers territories it actually holds work for — a filter that can
   * return nothing is a filter nobody trusts.
   */
  const territoryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of vehicles) {
      const key = v.territory?.name ?? UNASSIGNED_TERRITORY;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [vehicles]);
  const valueAtDesk = useMemo(
    () => vehicles.reduce((s, v) => s + (v.totalCost ?? 0), 0),
    [vehicles],
  );

  const filtered = useMemo(() => {
    let list = graded;
    if (filter.search.trim()) list = list.filter((g) => matchSearch(g.v, filter.search));
    if (filter.sla.length) list = list.filter((g) => filter.sla.includes(g.sla.level));
    if (filter.letters.length) list = list.filter((g) => filter.letters.includes(g.v.letterStage));
    if (filter.territories.length) {
      list = list.filter((g) =>
        filter.territories.includes(g.v.territory?.name ?? UNASSIGNED_TERRITORY),
      );
    }
    // Capture window. Both ends inclusive whole days in local time — a range
    // of 1–31 July must contain everything captured on the 31st.
    if (filter.from) {
      const start = dayBound(filter.from, false);
      if (start) list = list.filter((g) => new Date(g.v.createdAt) >= start);
    }
    if (filter.to) {
      const end = dayBound(filter.to, true);
      if (end) list = list.filter((g) => new Date(g.v.createdAt) <= end);
    }

    const dir = filter.sortDir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (filter.sortKey) {
        case "vehicle":
          cmp = vehicleTitle(a.v).localeCompare(vehicleTitle(b.v));
          break;
        case "reg":
          cmp = a.v.registrationNo.localeCompare(b.v.registrationNo);
          break;
        case "customer":
          cmp = a.v.customerName.localeCompare(b.v.customerName);
          break;
        case "cost":
          cmp = (a.v.totalCost ?? 0) - (b.v.totalCost ?? 0);
          break;
        case "date":
          cmp = new Date(a.v.createdAt).getTime() - new Date(b.v.createdAt).getTime();
          break;
        case "sla":
          // Rank first, then age, so two breaching files still order sensibly.
          cmp = slaRank(a.sla.level) - slaRank(b.sla.level) || a.sla.days - b.sla.days;
          break;
      }
      return cmp * dir;
    });
  }, [graded, filter]);

  const openVehicle = useMemo(
    () => filtered.find((g) => g.v.id === openId)?.v ?? null,
    [filtered, openId],
  );

  const toggleSort = (k: SortKey) => {
    setFilter((f) => ({
      ...f,
      sortKey: k,
      sortDir: f.sortKey === k && f.sortDir === "asc" ? "desc" : "asc",
    }));
  };

  const applyView = (v: SavedView) => {
    setActiveView(v.id);
    setFilter(viewToFilter(v));
    setCursor(-1);
  };

  const togglePick = useCallback((id: string) => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }, []);

  // Keyboard flow over the list. Ignored while focus is in a text field so
  // typing a search term does not move the cursor underneath the user.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!filtered.length) return;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter" && cursor >= 0) {
        e.preventDefault();
        setOpenId(filtered[cursor].v.id);
      } else if (e.key === "x" && cursor >= 0) {
        e.preventDefault();
        togglePick(filtered[cursor].v.id);
      } else if (e.key === "Escape") {
        if (openId) setOpenId(null);
        else if (picked.length) setPicked([]);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [filtered, cursor, openId, picked.length, togglePick]);

  useEffect(() => {
    if (cursor < 0) return;
    const rows = listRef.current?.querySelectorAll("tr");
    rows?.[cursor]?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const dirty = useMemo(() => {
    const v = views.find((x) => x.id === activeView);
    return v ? !filterMatchesView(filter, v) : true;
  }, [views, activeView, filter]);

  const countFor = useCallback(
    (v: SavedView) => {
      let list = graded;
      if (v.search.trim()) list = list.filter((g) => matchSearch(g.v, v.search));
      if (v.sla.length) list = list.filter((g) => v.sla.includes(g.sla.level));
      if (v.letters.length) list = list.filter((g) => v.letters.includes(g.v.letterStage));
      return list.length;
    },
    [graded],
  );

  const toggleTerritory = (name: string) => {
    setFilter((f) => ({
      ...f,
      territories: f.territories.includes(name)
        ? f.territories.filter((t) => t !== name)
        : [...f.territories, name],
    }));
    setActiveView("");
  };

  const setWindow = (from: string, to: string) => {
    setFilter((f) => ({ ...f, from, to }));
    setActiveView("");
  };

  const narrowed =
    filter.territories.length > 0 || Boolean(filter.from) || Boolean(filter.to);

  const toggleSlaFilter = (levels: SlaLevel[]) => {
    setFilter((f) => {
      const on = levels.every((l) => f.sla.includes(l)) && f.sla.length === levels.length;
      return { ...f, sla: on ? [] : levels };
    });
    setActiveView("");
  };

  // Set inline because it varies per row with the density control, so it has
  // to beat the .dtable rule rather than sit alongside it. Kept in step with
  // the DENSITY block in globals.css.
  const padY = density === "compact" ? 5 : 9;
  const rowPad = {
    paddingTop: padY,
    paddingBottom: padY,
    paddingLeft: 14,
    paddingRight: 14,
  } as const;


  return (
    <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-7">
      {/* ---- Header ---- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1" style={{ minWidth: 280 }}>
          <PanelHero eyebrow="Desk inbox" title={title} subtitle={subtitle} art="desk" />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <span className="hidden items-center gap-1.5 font-mono text-[10.5px] text-ink-3 lg:flex">
            <kbd className="kbd">
              <Command size={9} />
            </kbd>
            <kbd className="kbd">K</kbd>
            search
          </span>
          <div className="seg" role="group" aria-label="Row density">
            <button
              className="seg-btn"
              data-on={density === "comfortable"}
              onClick={() => setDensity("comfortable")}
              title="Comfortable rows"
              aria-label="Comfortable rows"
            >
              <Rows3 size={13} />
            </button>
            <button
              className="seg-btn"
              data-on={density === "compact"}
              onClick={() => setDensity("compact")}
              title="Compact rows"
              aria-label="Compact rows"
            >
              <Rows4 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ---- Metric rail. Each tile is also the filter for what it counts. ---- */}
      <div className="stagger mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          icon={<Inbox size={17} />}
          tint="accent"
          label="Awaiting you"
          value={summary.total}
          caption={summary.total === 1 ? "file to action" : "files to action"}
          onClick={() => {
            setFilter(EMPTY_FILTER);
            setActiveView("all");
          }}
          active={filter.sla.length === 0 && !filter.search}
        />
        <StatTile
          icon={<AlertTriangle size={17} />}
          tint={summary.breach > 0 ? "bad" : summary.risk > 0 ? "warn" : "neutral"}
          label="Needs attention"
          value={summary.risk + summary.breach}
          caption={
            summary.overdue > 0
              ? `${summary.overdue} past repair deadline`
              : summary.risk + summary.breach > 0
                ? "past desk target"
                : "all within target"
          }
          onClick={() => toggleSlaFilter(["risk", "breach"])}
          active={filter.sla.length === 2}
        />
        <StatTile
          icon={<Wallet size={17} />}
          tint="info"
          label="Value at desk"
          value={valueAtDesk}
          display={<span suppressHydrationWarning>{takaCompact(valueAtDesk)}</span>}
          caption="total cost booked"
        />
        <StatTile
          icon={<Hourglass size={17} />}
          tint={summary.oldest >= 7 ? "warn" : "neutral"}
          label="Longest wait"
          value={summary.oldest}
          display={<span>{summary.oldest}d</span>}
          caption={summary.oldest >= 7 ? "needs a decision" : "within target"}
        />
      </div>

      {/* ---- Views + search ---- */}
      {vehicles.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {views.map((v) => {
            const n = countFor(v);
            return (
              <span key={v.id} className="group/chip relative inline-flex">
                <button
                  className="viewchip"
                  data-on={activeView === v.id && !dirty}
                  onClick={() => applyView(v)}
                >
                  {v.builtin ? null : <Bookmark size={11} />}
                  {v.name}
                  <span className="viewchip-count">{n}</span>
                </button>
                {!v.builtin && (
                  <button
                    onClick={() => {
                      remove(v.id);
                      if (activeView === v.id) {
                        setActiveView("all");
                        setFilter(EMPTY_FILTER);
                      }
                    }}
                    className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 place-items-center rounded-full border border-rule bg-surface text-ink-3 shadow-card transition-colors hover:text-bad group-hover/chip:grid"
                    aria-label={`Delete view ${v.name}`}
                  >
                    <Trash2 size={9} />
                  </button>
                )}
              </span>
            );
          })}

          {/* Offer to keep the current filter only when it is actually new. */}
          {dirty &&
            (filter.search.trim() ||
              filter.sla.length ||
              filter.letters.length ||
              narrowed) && (
            naming ? (
              <span className="inline-flex items-center gap-1.5">
                <input
                  autoFocus
                  className="field"
                  style={{ width: 160, padding: "5px 10px", fontSize: 12 }}
                  placeholder="View name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      const id = save({ ...filter, name: newName.trim() });
                      setActiveView(id);
                      setNaming(false);
                      setNewName("");
                    } else if (e.key === "Escape") {
                      setNaming(false);
                      setNewName("");
                    }
                  }}
                />
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!newName.trim()}
                  onClick={() => {
                    const id = save({ ...filter, name: newName.trim() });
                    setActiveView(id);
                    setNaming(false);
                    setNewName("");
                  }}
                >
                  Save
                </button>
              </span>
            ) : (
              <button className="viewchip" onClick={() => setNaming(true)}>
                <BookmarkPlus size={12} /> Save this view
              </button>
            )
          )}

          <div className="ml-auto flex items-center gap-2.5">
            {filtered.length !== vehicles.length && (
              <span className="font-mono text-[11px] text-ink-3">
                {filtered.length} of {vehicles.length}
              </span>
            )}
            <SearchBar
              value={filter.search}
              onChange={(s) => {
                setFilter((f) => ({ ...f, search: s }));
                setActiveView("");
              }}
              placeholder="Search vehicles, customers, registration…"
              className="w-[260px]"
            />
          </div>
        </div>
      )}

      {/* ---- Territory & capture window ----
          A second row, because these narrow WHICH files are on the desk while
          the row above narrows how they are shown. Both are client-side: every
          row is already here, so filtering is instant and costs no round trip. */}
      {vehicles.length > 0 && (
        <div className="deskfilter mt-2.5">
          {territoryOptions.length > 1 && (
            <div className="deskfilter-group">
              <span className="deskfilter-label">
                <MapPin size={11} />
                Territory
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {territoryOptions.map((t) => (
                  <button
                    key={t.name}
                    className="terr-chip"
                    data-on={filter.territories.includes(t.name)}
                    onClick={() => toggleTerritory(t.name)}
                    aria-pressed={filter.territories.includes(t.name)}
                  >
                    {t.name}
                    <span className="terr-count">{t.count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="deskfilter-group">
            <span className="deskfilter-label">
              <CalendarRange size={11} />
              Captured
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="field h-8 w-[138px] py-0 text-xs"
                aria-label="Captured from"
                value={filter.from}
                max={filter.to || undefined}
                onChange={(e) => setWindow(e.target.value, filter.to)}
              />
              <span className="text-[11px] text-ink-3">to</span>
              <input
                type="date"
                className="field h-8 w-[138px] py-0 text-xs"
                aria-label="Captured to"
                value={filter.to}
                min={filter.from || undefined}
                onChange={(e) => setWindow(filter.from, e.target.value)}
              />
            </div>
          </div>

          {narrowed && (
            <button
              className="btn btn-ghost btn-sm shrink-0"
              onClick={() => {
                setFilter((f) => ({ ...f, territories: [], from: "", to: "" }));
                setActiveView("");
              }}
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      )}

      {/* ---- Workspace ---- */}
      <div className="ws mt-4" data-detail={openVehicle ? "true" : "false"}>
        <div className="min-w-0">
          {vehicles.length === 0 ? (
            <EmptyDesk />
          ) : filtered.length === 0 ? (
            <NoMatches
              onClear={() => {
                setFilter(EMPTY_FILTER);
                setActiveView("all");
              }}
            />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="dtable">
                  <thead>
                    <tr>
                      <th style={{ width: 34, paddingRight: 0 }}>
                        <input
                          type="checkbox"
                          aria-label="Select all shown"
                          checked={picked.length > 0 && picked.length === filtered.length}
                          ref={(el) => {
                            if (el)
                              el.indeterminate =
                                picked.length > 0 && picked.length < filtered.length;
                          }}
                          onChange={(e) =>
                            setPicked(e.target.checked ? filtered.map((g) => g.v.id) : [])
                          }
                        />
                      </th>
                      {/* THE LEADING COLUMN IS THE ACCOUNT.
                          It used to be the vehicle, with the customer three
                          columns to its right — so a desk scanning its inbox
                          read a list of load classes and had to track sideways
                          to find out whose file each row was. The columns are
                          the same three; they have swapped ends, and both
                          still sort on the key they always did. */}
                      <th className="sortable group" onClick={() => toggleSort("customer")}>
                        Customer <SortIcon column="customer" sortKey={filter.sortKey} sortDir={filter.sortDir} />
                      </th>
                      <th className="sortable group" onClick={() => toggleSort("reg")}>
                        Reg no <SortIcon column="reg" sortKey={filter.sortKey} sortDir={filter.sortDir} />
                      </th>
                      <th className="sortable group" onClick={() => toggleSort("vehicle")}>
                        Vehicle <SortIcon column="vehicle" sortKey={filter.sortKey} sortDir={filter.sortDir} />
                      </th>
                      {columns.includes("letter") && <th>Letter</th>}
                      {columns.includes("engineer") && <th>Engineer</th>}
                      {columns.includes("territory") && <th>Territory</th>}
                      {columns.includes("cost") && (
                        <th
                          className="sortable group text-right"
                          onClick={() => toggleSort("cost")}
                        >
                          Total cost <SortIcon column="cost" sortKey={filter.sortKey} sortDir={filter.sortDir} />
                        </th>
                      )}
                      <th className="sortable group" onClick={() => toggleSort("sla")}>
                        Waiting <SortIcon column="sla" sortKey={filter.sortKey} sortDir={filter.sortDir} />
                      </th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody ref={listRef}>
                    {filtered.map(({ v, sla }, i) => (
                      <tr
                        key={v.id}
                        className="ws-row"
                        data-open={openId === v.id}
                        data-picked={picked.includes(v.id)}
                        data-cursor={cursor === i}
                        style={{
                          ["--sla-color" as string]: sla.color ?? "transparent",
                          animation: `fadeIn 0.15s var(--ease-standard) ${Math.min(i, 12) * 0.02}s both`,
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          setOpenId(v.id);
                          setCursor(i);
                        }}
                      >
                        <td
                          style={{ ...rowPad, paddingRight: 0 }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`Select ${accountTitle(v)}`}
                            checked={picked.includes(v.id)}
                            onChange={() => togglePick(v.id)}
                          />
                        </td>
                        <td className="strong" style={rowPad}>
                          <AccountTitle record={v} as="div" />
                        </td>
                        <td className="font-mono text-xs" style={rowPad}>
                          {v.registrationNo}
                        </td>
                        <td style={rowPad}>{vehicleTitle(v)}</td>
                        {columns.includes("letter") && (
                          <td style={rowPad}>
                            <Chip tone={LETTER_META[v.letterStage].tone}>
                              {LETTER_META[v.letterStage].label}
                            </Chip>
                          </td>
                        )}
                        {columns.includes("engineer") && (
                          <td style={rowPad}>{v.assignedEngineer?.name ?? "—"}</td>
                        )}
                        {columns.includes("territory") && (
                          <td style={rowPad}>{v.territory?.name ?? "—"}</td>
                        )}
                        {columns.includes("cost") && (
                          <td
                            className="text-right tnum font-medium"
                            style={rowPad}
                          >
                            {v.totalCost != null ? taka(v.totalCost) : "—"}
                          </td>
                        )}
                        <td style={rowPad}>
                          <span
                            className="flex items-center gap-1.5 whitespace-nowrap"
                            style={{ ["--sla-color" as string]: sla.color ?? "var(--rule-strong)" }}
                            title={`${shortDate(v.createdAt)} · ${sla.label}`}
                          >
                            <span className="sla-dot" />
                            <span
                              className="font-mono text-[11px]"
                              style={{
                                color: sla.overdue
                                  ? "var(--bad)"
                                  : sla.level === "risk"
                                    ? "var(--warn)"
                                    : "var(--ink-3)",
                              }}
                            >
                              {sla.days}d
                            </span>
                          </span>
                        </td>
                        <td style={rowPad} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {quickActions.map((qa) => (
                              <button
                                key={qa.action}
                                className={`btn btn-sm ${
                                  qa.tone === "danger"
                                    ? "btn-danger"
                                    : qa.tone === "ok"
                                      ? "btn-ok"
                                      : "btn-ghost"
                                }`}
                                onClick={() =>
                                  setPending({
                                    vehicleId: v.id,
                                    action: {
                                      action: qa.action,
                                      label: qa.label,
                                      tone: qa.tone,
                                      requiresNote: qa.requiresNote,
                                      detail: qa.detail,
                                    },
                                  })
                                }
                              >
                                {qa.short}
                              </button>
                            ))}
                            <Link
                              href={`/vehicles/${v.id}`}
                              className="btn btn-ghost btn-sm"
                            >
                              {actionLabel} <ArrowRight size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-rule bg-surface-2 px-4 py-2.5">
                <span className="font-mono text-[11px] text-ink-3">
                  {filtered.length} {filtered.length === 1 ? "vehicle" : "vehicles"}
                  {summary.overdue > 0 && ` · ${summary.overdue} overdue`}
                </span>
                <span className="hidden font-mono text-[10.5px] text-ink-3 lg:inline">
                  <kbd className="kbd">j</kbd> <kbd className="kbd">k</kbd> move ·{" "}
                  <kbd className="kbd">x</kbd> select · <kbd className="kbd">↵</kbd> open
                </span>
              </div>
            </div>
          )}
        </div>

        {openVehicle && (
          <>
            <div className="ws-scrim" onClick={() => setOpenId(null)} aria-hidden />
            <DetailPane
              key={openVehicle.id}
              vehicle={openVehicle}
              quickActions={quickActions}
              onClose={() => setOpenId(null)}
              onAction={(qa) =>
                setPending({
                  vehicleId: openVehicle.id,
                  action: {
                    action: qa.action,
                    label: qa.label,
                    tone: qa.tone,
                    requiresNote: qa.requiresNote,
                    detail: qa.detail,
                  },
                })
              }
            />
          </>
        )}
      </div>

      {insight}

      {picked.length > 0 && quickActions.length > 0 && (
        <BulkBar
          selected={picked}
          actions={quickActions}
          labelFor={(id) => {
            const g = graded.find((x) => x.v.id === id);
            return g ? `${vehicleTitle(g.v)} (${g.v.registrationNo})` : id;
          }}
          onClear={() => setPicked([])}
          onDone={() => router.refresh()}
        />
      )}

      {pending && (
        <ActionModal
          vehicleId={pending.vehicleId}
          pending={pending.action}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            setOpenId(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EmptyDesk() {
  return (
    <div
      className="card grid place-items-center gap-3 px-6 py-16 text-center"
      style={{ animation: "fadeIn 0.28s var(--ease-standard)" }}
    >
      <div className="grid h-14 w-14 place-items-center rounded-full bg-ok-soft">
        <CheckCircle2 size={28} className="text-ok" strokeWidth={1.5} />
      </div>
      <div>
        <p className="font-display text-[15px] font-bold text-ink">Inbox zero</p>
        <p className="mt-1 text-[13px] text-ink-2">Nothing is waiting for your action.</p>
      </div>
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div
      className="card grid place-items-center gap-3 px-6 py-14 text-center"
      style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-3">
        <SearchX size={24} className="text-ink-3" strokeWidth={1.5} />
      </div>
      <div>
        <p className="font-display text-[15px] font-bold text-ink">No files match</p>
        <p className="mt-1 text-[13px] text-ink-2">
          Files are on this desk, but none match the current filter.
        </p>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onClear}>
        Clear filters
      </button>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AccountTitle } from "@/components/ui/AccountTitle";
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Clock3,
  Gauge,
  PackageSearch,
  SearchX,
  Timer,
  Users,
  Wrench,
  VolumeX,
} from "lucide-react";
import type { RepairStage } from "@prisma/client";
import {
  SILENT_HOURS,
  type EngineerRepairSummary,
  type LiveRepair,
} from "@/lib/repairs";
import { REPAIR_STAGES, REPAIR_STAGE_META } from "@/lib/repair";
import { duration, taka, takaCompact, timeAgo } from "@/lib/format";
import { PanelHero } from "@/components/ui/PanelHero";
import { StatTile } from "@/components/ui/StatTile";
import { SearchBar } from "@/components/ui/SearchBar";
import { Chip } from "@/components/ui/Chip";
import { usePersistedEnum } from "@/lib/usePersisted";

/**
 * Repair tracking for the Service Manager.
 *
 * Two readings of the same commitment. "Live repairs" is per vehicle — what
 * did I authorise, how long has it been running, how long is left. "By
 * engineer" is per person — who is carrying what, and who has a record of
 * finishing on time.
 *
 * The organising idea on both is BURN: elapsed hours against the window the
 * Service Manager granted. A repair 90% through its window with the engineer
 * still reporting "awaiting parts" is the thing worth a phone call, and no
 * count of days on its own says that.
 */

type Tab = "live" | "engineers";
const TABS = ["live", "engineers"] as const;

type SortKey = "deadline" | "burn" | "elapsed" | "silent" | "cost" | "vehicle";

const HOUR = 3_600_000;

export function RepairBoard({
  repairs,
  engineers,
  roster,
}: {
  repairs: LiveRepair[];
  engineers: EngineerRepairSummary[];
  roster: { id: string; name: string; staffId: string }[];
}) {
  const [tab, setTab] = usePersistedEnum<Tab>("ri:repairs:tab", TABS, "live");
  const [engineer, setEngineer] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("deadline");
  const [asc, setAsc] = useState(true);
  const [only, setOnly] = useState<null | "overdue" | "silent" | "parts">(null);

  const filtered = useMemo(() => {
    let list = repairs;
    if (engineer !== "all") list = list.filter((r) => (r.engineerId ?? "none") === engineer);
    if (only === "overdue") list = list.filter((r) => r.remainingHours !== null && r.remainingHours < 0);
    if (only === "silent") list = list.filter((r) => r.silentHours !== null && r.silentHours >= SILENT_HOURS);
    if (only === "parts") list = list.filter((r) => r.stage === "AWAITING_PARTS");

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.registrationNo.toLowerCase().includes(q) ||
          r.engineerName.toLowerCase().includes(q) ||
          (r.territory ?? "").toLowerCase().includes(q),
      );
    }

    const dir = asc ? 1 : -1;
    // Nulls always sort last, whichever direction: a repair we cannot measure
    // is not "the most urgent", it is unknown.
    const nl = (v: number | null) => (v === null ? Number.POSITIVE_INFINITY * dir : v);

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "deadline":
          cmp = nl(a.remainingHours) - nl(b.remainingHours);
          break;
        case "burn":
          cmp = nl(a.burn) - nl(b.burn);
          break;
        case "elapsed":
          cmp = nl(a.elapsedHours) - nl(b.elapsedHours);
          break;
        case "silent":
          cmp = nl(a.silentHours) - nl(b.silentHours);
          break;
        case "cost":
          cmp = a.repairCost - b.repairCost;
          break;
        case "vehicle":
          cmp = a.name.localeCompare(b.name);
          break;
      }
      return cmp * dir;
    });
  }, [repairs, engineer, only, search, sortKey, asc]);

  const totals = useMemo(() => {
    const overdue = repairs.filter((r) => r.remainingHours !== null && r.remainingHours < 0);
    const silent = repairs.filter((r) => r.silentHours !== null && r.silentHours >= SILENT_HOURS);
    const parts = repairs.filter((r) => r.stage === "AWAITING_PARTS");
    return {
      live: repairs.length,
      overdue: overdue.length,
      silent: silent.length,
      parts: parts.length,
      value: repairs.reduce((s, r) => s + r.repairCost, 0),
    };
  }, [repairs]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      // Deadline and silence read best soonest-first; money reads best
      // largest-first. Default to whichever puts the interesting row on top.
      setAsc(k === "deadline" || k === "vehicle");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1" style={{ minWidth: 280 }}>
          <PanelHero
            eyebrow="Workshop"
            title="Repair tracking"
            subtitle="Every repair you approved, how long it has been running, and how long is left."
            art="desk"
          />
        </div>
      </div>

      {/* ---- Roll-up. Each tile is also the filter for what it counts. ---- */}
      <div className="stagger mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          icon={<Wrench size={17} />}
          tint="accent"
          label="Live repairs"
          value={totals.live}
          caption={totals.value > 0 ? `${takaCompact(totals.value)} authorised` : "nothing running"}
          onClick={() => setOnly(null)}
          active={only === null}
        />
        <StatTile
          icon={<AlertTriangle size={17} />}
          tint={totals.overdue > 0 ? "bad" : "neutral"}
          label="Past deadline"
          value={totals.overdue}
          caption={totals.overdue === 0 ? "all inside the window" : "need chasing now"}
          onClick={() => setOnly(only === "overdue" ? null : "overdue")}
          active={only === "overdue"}
        />
        <StatTile
          icon={<VolumeX size={17} />}
          tint={totals.silent > 0 ? "warn" : "neutral"}
          label="No report"
          value={totals.silent}
          caption={`silent over ${SILENT_HOURS}h`}
          onClick={() => setOnly(only === "silent" ? null : "silent")}
          active={only === "silent"}
        />
        <StatTile
          icon={<PackageSearch size={17} />}
          tint={totals.parts > 0 ? "warn" : "neutral"}
          label="Awaiting parts"
          value={totals.parts}
          caption="blocked, not slow"
          onClick={() => setOnly(only === "parts" ? null : "parts")}
          active={only === "parts"}
        />
      </div>

      {/* ---- Controls ---- */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <div className="seg" role="group" aria-label="View">
          <button className="seg-btn" data-on={tab === "live"} onClick={() => setTab("live")}>
            <Clock3 size={12} />
            Live repairs
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{repairs.length}</span>
          </button>
          <button
            className="seg-btn"
            data-on={tab === "engineers"}
            onClick={() => setTab("engineers")}
          >
            <Users size={12} />
            By engineer
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{engineers.length}</span>
          </button>
        </div>

        {tab === "live" && (
          <>
            <label className="sr-only" htmlFor="engineer-filter">
              Filter by service engineer
            </label>
            <select
              id="engineer-filter"
              className="field h-9 w-[210px] py-0 text-xs"
              value={engineer}
              onChange={(e) => setEngineer(e.target.value)}
            >
              <option value="all">All engineers ({repairs.length})</option>
              {roster.map((e) => {
                const n = repairs.filter((r) => r.engineerId === e.id).length;
                return (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.staffId} ({n})
                  </option>
                );
              })}
              {repairs.some((r) => !r.engineerId) && (
                <option value="none">
                  Unassigned ({repairs.filter((r) => !r.engineerId).length})
                </option>
              )}
            </select>

            <div className="min-w-[190px] flex-1">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search vehicle, registration, engineer…"
              />
            </div>
          </>
        )}
      </div>

      {tab === "live" ? (
        <LiveTable
          rows={filtered}
          sortKey={sortKey}
          asc={asc}
          onSort={toggleSort}
          filtered={engineer !== "all" || only !== null || search.trim() !== ""}
          onClear={() => {
            setEngineer("all");
            setOnly(null);
            setSearch("");
          }}
        />
      ) : (
        <EngineerTable engineers={engineers} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live repairs
// ---------------------------------------------------------------------------

function LiveTable({
  rows,
  sortKey,
  asc,
  onSort,
  filtered,
  onClear,
}: {
  rows: LiveRepair[];
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  filtered: boolean;
  onClear: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="card mt-3.5 py-14 text-center">
        <SearchX size={22} className="mx-auto mb-2 text-ink-3" />
        <p className="text-[13px] text-ink-2">
          {filtered ? "No repair matches this filter." : "No repair is currently approved and running."}
        </p>
        {filtered && (
          <button className="btn btn-ghost btn-sm mt-3" onClick={onClear}>
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card mt-3.5 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="dtable w-full">
          <thead>
            <tr>
              {/* Sorts on the same key it always did — the column is now
                  headed by the account, and `vehicle` remains the sort the
                  board was built around. */}
              <SortHead label="Customer" k="vehicle" sortKey={sortKey} asc={asc} onSort={onSort} />
              <th>Engineer</th>
              <th>Reported stage</th>
              <SortHead label="Running" k="elapsed" sortKey={sortKey} asc={asc} onSort={onSort} num />
              <SortHead label="Left" k="deadline" sortKey={sortKey} asc={asc} onSort={onSort} num />
              <SortHead label="Window used" k="burn" sortKey={sortKey} asc={asc} onSort={onSort} />
              <SortHead label="Last word" k="silent" sortKey={sortKey} asc={asc} onSort={onSort} num />
              <SortHead label="Approved" k="cost" sortKey={sortKey} asc={asc} onSort={onSort} num />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const overdue = r.remainingHours !== null && r.remainingHours < 0;
              const silent = r.silentHours !== null && r.silentHours >= SILENT_HOURS;
              return (
                <tr key={r.id}>
                  <td className="strong">
                    <Link href={`/vehicles/${r.id}`} className="hover:text-accent">
                      <AccountTitle record={r} as="div" />
                    </Link>
                    <span className="block font-mono text-[10px] text-ink-3">
                      {r.registrationNo} · {r.name}
                      {r.territory ? ` · ${r.territory}` : ""}
                    </span>
                  </td>

                  <td>
                    <span className="block truncate text-[11.5px] text-ink-2">{r.engineerName}</span>
                    {r.engineerStaffId && (
                      <span className="block font-mono text-[9.5px] text-ink-3">
                        {r.engineerStaffId}
                      </span>
                    )}
                  </td>

                  <td>
                    <StageCell stage={r.stage} note={r.stageNote} />
                  </td>

                  <td className="num tnum">
                    {r.elapsedHours === null ? (
                      <Unknown />
                    ) : (
                      <span className="text-ink">{duration(r.elapsedHours * HOUR)}</span>
                    )}
                    {r.allowedDays !== null && (
                      <span className="block font-mono text-[9.5px] text-ink-3">
                        of {r.allowedDays}d granted
                      </span>
                    )}
                  </td>

                  <td className="num tnum">
                    {r.remainingHours === null ? (
                      <Unknown />
                    ) : (
                      <span
                        className="font-semibold"
                        style={{ color: overdue ? "var(--bad)" : r.remainingHours < 24 ? "var(--warn)" : "var(--ink)" }}
                      >
                        {overdue ? "−" : ""}
                        {duration(r.remainingHours * HOUR)}
                      </span>
                    )}
                    <span className="block font-mono text-[9.5px] text-ink-3">
                      {overdue ? "past deadline" : "remaining"}
                    </span>
                  </td>

                  <td style={{ minWidth: 130 }}>
                    <BurnBar burn={r.burn} overdue={overdue} />
                  </td>

                  <td className="num tnum">
                    {r.silentHours === null ? (
                      <Unknown />
                    ) : (
                      <span style={{ color: silent ? "var(--warn)" : "var(--ink-2)" }}>
                        {duration(r.silentHours * HOUR)}
                      </span>
                    )}
                    <span className="block font-mono text-[9.5px] text-ink-3">
                      {r.stageAt ? timeAgo(r.stageAt) : "never reported"}
                    </span>
                  </td>

                  <td className="num tnum">{taka(r.repairCost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Elapsed against the granted window.
 *
 * The bar is the reading, the percentage is the confirmation. Past 100% it
 * stops growing and turns — a bar that overflows its track just looks broken,
 * and "how far over" is already answered by the Left column.
 */
function BurnBar({ burn, overdue }: { burn: number | null; overdue: boolean }) {
  if (burn === null) return <Unknown />;
  const pct = Math.round(burn * 100);
  const width = Math.min(100, Math.max(2, pct));
  const tone = overdue || burn >= 1 ? "bad" : burn >= 0.75 ? "warn" : burn >= 0.4 ? "accent" : "ok";

  return (
    <div data-tone={tone}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] font-semibold tabular-nums" style={{ color: "var(--tone)" }}>
          {pct}%
        </span>
        {burn >= 1 && (
          <span className="font-mono text-[9px] uppercase tracking-wider text-bad">over</span>
        )}
      </div>
      <div className="bar-track mt-1" style={{ display: "block" }}>
        <span className="bar-fill block" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

function StageCell({ stage, note }: { stage: RepairStage | null; note: string | null }) {
  if (!stage) {
    return (
      <span className="font-mono text-[10.5px] text-ink-3">Not reported</span>
    );
  }
  const meta = REPAIR_STAGE_META[stage];
  return (
    <span className="block min-w-0">
      <Chip tone={meta.tone}>{meta.label}</Chip>
      {note && (
        <span className="mt-1 block max-w-[190px] truncate text-[10.5px] text-ink-3" title={note}>
          “{note}”
        </span>
      )}
    </span>
  );
}

/** A measurement we do not have, distinguished from a measurement of zero. */
function Unknown() {
  return <span className="font-mono text-[10.5px] text-ink-3">—</span>;
}

// ---------------------------------------------------------------------------
// By engineer
// ---------------------------------------------------------------------------

function EngineerTable({ engineers }: { engineers: EngineerRepairSummary[] }) {
  // Busiest bench first, then whoever is carrying trouble.
  const sorted = useMemo(
    () =>
      [...engineers].sort(
        (a, b) => b.overdue - a.overdue || b.live - a.live || a.name.localeCompare(b.name),
      ),
    [engineers],
  );

  const peakLoad = Math.max(1, ...sorted.map((e) => e.live));

  return (
    <div className="mt-3.5 grid grid-cols-1 gap-2.5 lg:grid-cols-2">
      {sorted.map((e) => (
        <EngineerCard key={e.id} e={e} peakLoad={peakLoad} />
      ))}
      {sorted.length === 0 && (
        <div className="card py-14 text-center lg:col-span-2">
          <SearchX size={22} className="mx-auto mb-2 text-ink-3" />
          <p className="text-[13px] text-ink-2">No service engineers on the roster.</p>
        </div>
      )}
    </div>
  );
}

/**
 * One engineer.
 *
 * A card rather than a table row: each engineer carries a load, a stage mix,
 * a time record and a money figure, and four unrelated units in one row is a
 * spreadsheet, not a reading.
 */
function EngineerCard({ e, peakLoad }: { e: EngineerRepairSummary; peakLoad: number }) {
  const decided = e.finishedOnTime + e.finishedLate;
  const onTimePct = decided ? Math.round((e.finishedOnTime / decided) * 100) : null;
  const initials = e.name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const trouble = e.overdue > 0 || e.silent > 0;

  return (
    <div className="insight-panel" data-tone={trouble ? "warn" : "accent"}>
      <div className="flex items-start gap-2.5">
        <span className="eng-avatar" data-trouble={trouble}>
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-display text-[15px] font-bold leading-tight text-ink">
              {e.name}
            </span>
            <span className="shrink-0 font-mono text-[9.5px] text-ink-3">{e.staffId}</span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {e.live === 0 ? (
              <span className="font-mono text-[10px] text-ink-3">bench clear</span>
            ) : (
              <span className="font-mono text-[10px] text-ink-2">
                {e.live} live · {takaCompact(e.valueInFlight)}
              </span>
            )}
            {e.overdue > 0 && <Chip tone="bad">{e.overdue} overdue</Chip>}
            {e.silent > 0 && <Chip tone="warn">{e.silent} silent</Chip>}
            {e.awaitingParts > 0 && <Chip tone="warn">{e.awaitingParts} on parts</Chip>}
            {e.ready > 0 && <Chip tone="ok">{e.ready} ready</Chip>}
          </div>
        </div>
      </div>

      {/* Load relative to the busiest bench, so the comparison is between
          people rather than against an arbitrary ceiling. */}
      <div className="mt-2.5" data-tone={trouble ? "warn" : "accent"}>
        <div className="flex items-baseline justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">
          <span>Bench load</span>
          <span className="tabular-nums">{e.live}</span>
        </div>
        <div className="bar-track mt-1" style={{ display: "block" }}>
          <span
            className="bar-fill block"
            style={{ width: `${Math.max(e.live === 0 ? 0 : 4, (e.live / peakLoad) * 100)}%` }}
          />
        </div>
      </div>

      {e.live > 0 && (
        <div className="mt-2.5">
          <StageStrip stages={e.stages} total={e.live} />
        </div>
      )}

      <div className="insight-rule" />

      <div className="grid grid-cols-3 gap-x-3">
        <Metric
          icon={<Timer size={10} />}
          label="Avg running"
          value={e.avgElapsedHours === null ? null : duration(e.avgElapsedHours * HOUR)}
          // Named only when it is a partial view, so a complete average is not
          // cluttered by a caveat it does not need.
          sub={
            e.measuredLive > 0 && e.measuredLive < e.live
              ? `${e.measuredLive} of ${e.live} timed`
              : undefined
          }
          tone="accent"
        />
        <Metric
          icon={<Gauge size={10} />}
          label="Closest call"
          value={
            e.worstRemainingHours === null
              ? null
              : e.worstRemainingHours < 0
                ? `−${duration(e.worstRemainingHours * HOUR)}`
                : duration(e.worstRemainingHours * HOUR)
          }
          tone={e.worstRemainingHours !== null && e.worstRemainingHours < 0 ? "bad" : "warn"}
        />
        <Metric
          icon={<CheckCircle2 size={10} />}
          label="On time"
          value={onTimePct === null ? null : `${onTimePct}%`}
          sub={decided ? `${decided} finished` : undefined}
          tone="ok"
        />
      </div>

      {e.avgTurnaroundHours !== null && (
        <p className="mt-2 font-mono text-[9.5px] text-ink-3">
          Typical turnaround {duration(e.avgTurnaroundHours * HOUR)} from approval to registration.
        </p>
      )}
    </div>
  );
}

/** The stage mix across one engineer's live bench, as a single bar. */
function StageStrip({ stages, total }: { stages: Record<string, number>; total: number }) {
  const parts = [
    ...REPAIR_STAGES.map((s) => ({
      key: s,
      label: REPAIR_STAGE_META[s].label,
      tone: REPAIR_STAGE_META[s].tone,
      count: stages[s] ?? 0,
    })),
    { key: "UNREPORTED", label: "Not reported", tone: "neutral" as const, count: stages.UNREPORTED ?? 0 },
  ].filter((p) => p.count > 0);

  if (parts.length === 0) return null;

  return (
    <>
      <div className="stack-bar" role="img" aria-label="Repair stage mix">
        {parts.map((p) => (
          <span
            key={p.key}
            className="stack-seg"
            data-tone={p.tone}
            style={{ width: `${(p.count / total) * 100}%` }}
            title={`${p.label}: ${p.count}`}
          />
        ))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5" data-tone={p.tone}>
            <span className="bar-dot" aria-hidden />
            <span className="font-mono text-[9.5px] text-ink-3">
              {p.label} {p.count}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub?: string;
  tone: string;
}) {
  return (
    <div data-tone={tone}>
      <div className="flex items-center gap-1 font-mono text-[8.5px] uppercase tracking-[0.1em] text-ink-3">
        {icon}
        {label}
      </div>
      {value === null ? (
        <div className="mt-1 font-mono text-[11px] text-ink-3">—</div>
      ) : (
        <div className="mt-1 font-display text-[15px] font-bold leading-none tabular-nums text-ink">
          {value}
        </div>
      )}
      {sub && <div className="mt-0.5 font-mono text-[8.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

function SortHead({
  label,
  k,
  sortKey,
  asc,
  onSort,
  num,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  num?: boolean;
}) {
  return (
    <th className={`sortable group ${num ? "num" : ""}`} onClick={() => onSort(k)}>
      {label}
      {sortKey !== k ? (
        <ArrowUpDown
          size={10}
          className="ml-1 inline opacity-0 transition-opacity group-hover:opacity-60"
        />
      ) : asc ? (
        <ArrowUp size={10} className="ml-1 inline text-accent" />
      ) : (
        <ArrowDown size={10} className="ml-1 inline text-accent" />
      )}
    </th>
  );
}

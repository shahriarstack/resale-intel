"use client";

import { useCallback, useMemo, useState } from "react";
import {
  CarFront,
  CheckCircle2,
  Clock,
  Landmark,
  Layers,
  Moon,
  Search,
  Timer,
  Truck,
  X,
} from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { ConsolePage, ConsoleSection, ListShell, ListEmpty } from "@/components/recovery/ConsolePage";
import { TerritoryTable } from "@/components/recovery/TerritoryTable";
import { CaseListRow, CaseListHeader } from "@/components/offroad/CaseListRow";
import type { CaseRow, ManagerMetrics } from "@/lib/recoveryDesk";
import type { TerritoryAnalytics } from "@/lib/recoveryRollup";

/**
 * The off-road book as a report, for business management.
 *
 * The recovery desk works this data as a queue — flag it, revise the window,
 * chase the officer. A BM does none of that and should not be offered it, so
 * every row here is read-only and the page is built around the two questions
 * management actually asks: how much of the fleet is not earning, and where.
 *
 * Summary first, detail underneath, and the two are wired together: the tiles
 * are the filter. Clicking "Accident" narrows the list below rather than
 * navigating somewhere else, so the drill-down never loses the context the
 * number came from — which is the failure mode of a summary that links out to
 * a separate list page.
 */
type Board = "all" | "accident" | "thana" | "closed";

const BOARDS: { key: Board; label: string; icon: typeof Layers }[] = [
  { key: "all", label: "All off the road", icon: Layers },
  { key: "accident", label: "Accident", icon: CarFront },
  { key: "thana", label: "Thana / Police", icon: Landmark },
  { key: "closed", label: "Back or written off", icon: CheckCircle2 },
];

export function OffroadOverview({
  openCases,
  closedCases,
  territory,
  metrics,
}: {
  openCases: CaseRow[];
  closedCases: CaseRow[];
  territory: TerritoryAnalytics;
  metrics: ManagerMetrics;
}) {
  const [board, setBoard] = useState<Board>("all");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  const hit = useCallback(
    (c: CaseRow) =>
      !q ||
      c.registrationNo.toLowerCase().includes(q) ||
      c.customerName.toLowerCase().includes(q) ||
      (c.make ?? "").toLowerCase().includes(q) ||
      (c.model ?? "").toLowerCase().includes(q) ||
      (c.territory?.name ?? "").toLowerCase().includes(q) ||
      (c.openedBy?.name ?? "").toLowerCase().includes(q),
    [q],
  );

  const rows = useMemo(() => {
    const base =
      board === "closed"
        ? closedCases
        : board === "accident"
          ? openCases.filter((c) => c.kind === "ACCIDENT")
          : board === "thana"
            ? openCases.filter((c) => c.kind === "THANA")
            : openCases;
    return base.filter(hit);
  }, [board, openCases, closedCases, hit]);

  const counts: Record<Board, number> = {
    all: openCases.length,
    accident: openCases.filter((c) => c.kind === "ACCIDENT").length,
    thana: openCases.filter((c) => c.kind === "THANA").length,
    closed: closedCases.length,
  };

  /** Clicking a tile sets the board; clicking the active one clears it. */
  const pick = (key: Board) => () => setBoard((b) => (b === key ? "all" : key));

  return (
    <ConsolePage
      eyebrow="Business management"
      title="Off-road fleet"
      icon={Truck}
      intro="Every vehicle off the road for a reason other than repossession — what it is, where it is, and how long it has been there. Read-only: the recovery desk owns the clock and the follow-up."
      actions={
        <div className="pill-search w-[300px]">
          <span className="grid h-9 w-10 shrink-0 place-items-center text-ink-3">
            <Search size={15} />
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reg no, customer, officer, territory…"
            aria-label="Search off-road cases"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="mr-2.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 hover:bg-surface-2 hover:text-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
      }
    >
      {/* ---- The summary ----
          Six readings, and the first three are also the filter for the list
          at the foot of the page. */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={<Truck size={16} />}
          tint="accent"
          ground="solid"
          label="Off the road"
          value={openCases.length}
          caption="open cases today"
          onClick={pick("all")}
          active={board === "all"}
        />
        <StatTile
          icon={<CarFront size={16} />}
          tint="warn"
          ground="solid"
          label="Accident"
          value={metrics.openAccident}
          caption="damaged, off-road"
          onClick={pick("accident")}
          active={board === "accident"}
        />
        <StatTile
          icon={<Landmark size={16} />}
          tint="info"
          ground="solid"
          label="Thana"
          value={metrics.openThana}
          caption="in police custody"
          onClick={pick("thana")}
          active={board === "thana"}
        />
        <StatTile
          icon={<Timer size={16} />}
          tint="bad"
          ground="solid"
          label="Past window"
          value={metrics.overdueCases}
          caption="over the estimate given"
        />
        <StatTile
          icon={<Moon size={16} />}
          tint="warn"
          ground="solid"
          label="No movement"
          value={metrics.staleCases}
          caption="nothing for 14 days"
        />
        <StatTile
          icon={<Clock size={16} />}
          tint="neutral"
          ground="solid"
          label="Average age"
          value={territory.total.avgDays ?? 0}
          display={territory.total.avgDays === null ? "—" : `${territory.total.avgDays}d`}
          caption={
            territory.total.oldestDays === null
              ? "no open cases"
              : `oldest ${territory.total.oldestDays}d`
          }
        />
      </div>

      {/* ---- Where ----
          The same territory roll-up the recovery desk reads. Management gets
          it unchanged on purpose: two versions of one table is how two parts
          of a company end up quoting different numbers at each other. */}
      <ConsoleSection
        title="By territory"
        hint="Each territory is one officer's patch. Read down a column to rank them; open a row to see what is outstanding and which side it is sitting on."
        className="mt-6"
      >
        {/* `observer`: the pending work on this table belongs to the recovery
            desk and its officers, not to this reader, and none of those queues
            will open for them. */}
        <TerritoryTable data={territory} viewer="observer" />
      </ConsoleSection>

      {/* ---- The detail ---- */}
      <ConsoleSection
        title="Case by case"
        hint="Every vehicle behind the figures above. Sorted by the field's own priority: flagged first, then past window, then by time remaining."
        className="mt-6"
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {BOARDS.map((bd) => {
              const on = board === bd.key;
              return (
                <button
                  key={bd.key}
                  onClick={() => setBoard(bd.key)}
                  aria-pressed={on}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
                  style={
                    on
                      ? { background: "var(--accent)", color: "var(--on-accent)" }
                      : { background: "var(--surface-2)", color: "var(--ink-2)" }
                  }
                >
                  <bd.icon size={13} />
                  {bd.label}
                  <span
                    className="font-mono text-[10.5px] tnum"
                    style={{ opacity: on ? 0.8 : 0.55 }}
                  >
                    {counts[bd.key]}
                  </span>
                </button>
              );
            })}
          </div>
        }
      >
        <ListShell>
          {rows.length === 0 ? (
            <ListEmpty
              icon={board === "thana" ? Landmark : CarFront}
              message={
                q
                  ? "Nothing matches that search."
                  : board === "closed"
                    ? "No cases have been closed yet."
                    : "Nothing on this board — no vehicles off the road for this reason."
              }
            />
          ) : (
            <>
              <CaseListHeader />
              {/* Always read-only. The flag and revise controls belong to the
                  recovery desk, and a BM pressing them would be acting in a
                  queue they are not accountable for. */}
              {rows.map((c) => (
                <CaseListRow key={c.id} kase={c} readOnly />
              ))}
            </>
          )}
        </ListShell>
      </ConsoleSection>
    </ConsolePage>
  );
}

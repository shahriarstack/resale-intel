"use client";

import { useCallback, useMemo, useState } from "react";
import { CarFront, CheckCircle2, Landmark, Layers, Search, X } from "lucide-react";
import { ConsolePage, ConsoleSection, ListShell, ListEmpty } from "@/components/recovery/ConsolePage";
import { CaseListRow, CaseListHeader } from "@/components/offroad/CaseListRow";
import {
  CaseFilters,
  EMPTY_FILTERS,
  applyCaseFilters,
  type CaseFilterState,
} from "@/components/offroad/CaseFilters";
import { PartFilter, matchesPart, type PartChoice } from "@/components/recovery/PartFilter";
import type { CaseRow } from "@/lib/recoveryDesk";

type Board = "all" | "accident" | "thana" | "closed";

const BOARDS: { key: Board; label: string; icon: typeof Layers }[] = [
  { key: "all", label: "All open", icon: Layers },
  { key: "accident", label: "Accident", icon: CarFront },
  { key: "thana", label: "Thana / Police", icon: Landmark },
  { key: "closed", label: "Closed", icon: CheckCircle2 },
];

/**
 * The off-road book, for the desk.
 *
 * One page, four views of the same table, rows rather than cards. The board
 * switch is in the page rather than the sidebar because these four are not
 * different jobs — they are one job filtered — whereas Credit Notes and
 * capture approvals genuinely are different jobs and now have their own routes.
 */
export function OffroadBoards({
  openCases,
  closedCases,
}: {
  openCases: CaseRow[];
  closedCases: CaseRow[];
}) {
  const [board, setBoard] = useState<Board>("all");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<CaseFilterState>(EMPTY_FILTERS);
  const [part, setPart] = useState<PartChoice>("all");

  const q = search.trim().toLowerCase();
  // Memoised on the query alone so the lists below are not invalidated by
  // every unrelated state change.
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

  // Unfiltered-but-searched, so the filter panel's option lists and chip counts
  // describe what is actually on this board.
  const base = useMemo(() => {
    const rows =
      board === "closed"
        ? closedCases
        : board === "accident"
          ? openCases.filter((c) => c.kind === "ACCIDENT")
          : board === "thana"
            ? openCases.filter((c) => c.kind === "THANA")
            : openCases;
    return rows.filter((c) => hit(c) && matchesPart(part, c.territory));
  }, [board, openCases, closedCases, hit, part]);

  const rows = useMemo(
    () => (board === "closed" ? base : applyCaseFilters(base, filters)),
    [base, filters, board],
  );

  // Every count on the page follows the scope, board pills included — a
  // part-wise manager reading the organisation's totals off their own
  // filtered board is the misreading this control exists to prevent.
  const inPart = openCases.filter((c) => matchesPart(part, c.territory));
  const counts: Record<Board, number> = {
    all: inPart.length,
    accident: inPart.filter((c) => c.kind === "ACCIDENT").length,
    thana: inPart.filter((c) => c.kind === "THANA").length,
    closed: closedCases.filter((c) => matchesPart(part, c.territory)).length,
  };
  const partCounts = {
    all: openCases.length,
    A: openCases.filter((c) => c.territory?.part === "A").length,
    B: openCases.filter((c) => c.territory?.part === "B").length,
  };

  return (
    <ConsolePage
      eyebrow="Supervision"
      title="Off-road cases"
      icon={CarFront}
      intro="Every vehicle off the road for a reason other than repossession. You own the clock and the flags; the officer on the ground owns the outcome."
      filter={<PartFilter value={part} onChange={setPart} counts={partCounts} />}
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
            aria-label="Search cases"
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
              <span className="font-mono text-[10.5px] tnum" style={{ opacity: on ? 0.8 : 0.55 }}>
                {counts[bd.key]}
              </span>
            </button>
          );
        })}
      </div>

      {board !== "closed" && (
        <CaseFilters
          kind={board === "thana" ? "THANA" : "ACCIDENT"}
          rows={base}
          value={filters}
          onChange={setFilters}
        />
      )}

      <ConsoleSection
        title={`${rows.length} case${rows.length === 1 ? "" : "s"}`}
        hint="Sorted by the officer's own priority: flagged first, then past window, then by time remaining."
        className="mt-4"
      >
        <ListShell>
          {rows.length === 0 ? (
            <ListEmpty
              icon={board === "thana" ? Landmark : CarFront}
              message={
                base.length
                  ? "Nothing matches these filters."
                  : board === "closed"
                    ? "No closed cases yet."
                    : "No open cases on this board."
              }
            />
          ) : (
            <>
              <CaseListHeader />
              {rows.map((c) => (
                <CaseListRow key={c.id} kase={c} readOnly={board === "closed"} />
              ))}
            </>
          )}
        </ListShell>
      </ConsoleSection>
    </ConsolePage>
  );
}

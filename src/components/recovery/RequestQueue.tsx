"use client";

import { useCallback, useMemo, useState } from "react";
import { CheckCircle2, FileClock, History, Search, X } from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { ConsolePage, ConsoleSection, ListShell, ListEmpty } from "@/components/recovery/ConsolePage";
import { PartFilter, matchesPart, type PartChoice } from "@/components/recovery/PartFilter";
import { RequestListRow, RequestListHeader } from "@/components/offroad/RequestListRow";
import { taka } from "@/lib/format";
import type { RequestRow } from "@/lib/recoveryDesk";

/**
 * The capture pre-approval desk.
 *
 * Its own route now, because it is a job rather than a view: the person here
 * is making decisions one after another, and a queue you work through wants a
 * page of its own rather than a tab inside somebody else's.
 *
 * The three figures above the queue are exposure, not activity — the total
 * outstanding across everything awaiting a decision is the number that says
 * how much is riding on this desk today.
 */
export function RequestQueue({
  pending,
  decided,
}: {
  pending: RequestRow[];
  decided: RequestRow[];
}) {
  const [tab, setTab] = useState<"pending" | "decided">(
    pending.length ? "pending" : "decided",
  );
  const [search, setSearch] = useState("");
  const [part, setPart] = useState<PartChoice>("all");

  const q = search.trim().toLowerCase();
  // Memoised on the query alone so the lists below are not invalidated by
  // every unrelated state change.
  const hit = useCallback(
    (r: RequestRow) =>
      !q ||
      r.registrationNo.toLowerCase().includes(q) ||
      r.customerName.toLowerCase().includes(q) ||
      r.customerCode.toLowerCase().includes(q) ||
      (r.requestedBy?.name ?? "").toLowerCase().includes(q) ||
      (r.territory?.name ?? "").toLowerCase().includes(q),
    [q],
  );

  const rows = useMemo(
    () =>
      (tab === "pending" ? pending : decided).filter((r) => hit(r) && matchesPart(part, r.territory)),
    [tab, pending, decided, hit, part],
  );

  // The readings above the list follow the part filter too. A part-wise
  // manager reading the whole organisation's exposure off their own filtered
  // queue is the exact misreading this control exists to prevent.
  const inPart = useMemo(() => pending.filter((r) => matchesPart(part, r.territory)), [pending, part]);
  const partCounts = useMemo(
    () => ({
      all: pending.length,
      A: pending.filter((r) => r.territory?.part === "A").length,
      B: pending.filter((r) => r.territory?.part === "B").length,
    }),
    [pending],
  );

  const exposure = inPart.reduce((s, r) => s + r.outstandingAmount, 0);
  const aged = inPart.filter((r) => r.ageDays >= 2).length;
  const resaleBound = inPart.filter((r) => !r.settlementPossible).length;

  return (
    <ConsolePage
      eyebrow="Pre-approval"
      title="Capture requests"
      icon={FileClock}
      intro="Nothing is seized until you rule. Every day a request waits here is a day an officer cannot act."
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
            placeholder="Reg no, customer, officer…"
            aria-label="Search requests"
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
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <StatTile
          icon={<FileClock size={16} />}
          tint="info"
          ground="solid"
          label="Awaiting you"
          value={inPart.length}
          caption="capture requests"
        />
        <StatTile
          icon={<History size={16} />}
          tint="warn"
          ground="solid"
          label="Over two days"
          value={aged}
          caption="officers held up"
        />
        <StatTile
          icon={<CheckCircle2 size={16} />}
          tint="accent"
          ground="solid"
          label="Outstanding"
          value={exposure}
          display={taka(exposure)}
          caption="riding on this queue"
        />
        <StatTile
          icon={<FileClock size={16} />}
          tint="bad"
          ground="solid"
          label="Resale-bound"
          value={resaleBound}
          caption="customer not expected to return"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {(
          [
            { key: "pending", label: "Awaiting decision", n: pending.length },
            { key: "decided", label: "Already ruled", n: decided.length },
          ] as const
        ).map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              aria-pressed={on}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors"
              style={
                on
                  ? { background: "var(--accent)", color: "var(--on-accent)" }
                  : { background: "var(--surface-2)", color: "var(--ink-2)" }
              }
            >
              {t.label}
              <span className="font-mono text-[10.5px] tnum" style={{ opacity: on ? 0.8 : 0.55 }}>
                {t.n}
              </span>
            </button>
          );
        })}
      </div>

      <ConsoleSection
        title={`${rows.length} request${rows.length === 1 ? "" : "s"}`}
        hint={
          tab === "pending"
            ? "Oldest first — the ones costing the field the most time."
            : "Every ruling on record, most recent first."
        }
        className="mt-4"
      >
        <ListShell>
          {rows.length === 0 ? (
            <ListEmpty
              icon={CheckCircle2}
              message={
                q
                  ? "Nothing matches your search."
                  : tab === "pending"
                    ? "No capture requests waiting. The field team has nothing pending on you."
                    : "Nothing decided yet."
              }
            />
          ) : (
            <>
              <RequestListHeader />
              {rows.map((r) => (
                <RequestListRow key={r.id} request={r} canDecide={tab === "pending"} />
              ))}
            </>
          )}
        </ListShell>
      </ConsoleSection>
    </ConsolePage>
  );
}

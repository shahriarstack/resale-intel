"use client";

import { useMemo, useState } from "react";
import { CarFront, CheckCircle2, Landmark, Layers } from "lucide-react";
import { AroList, AroSearch, AroTabs, AroHeader, type AroTab } from "@/components/aro/AroList";
import { CaseCard } from "@/components/offroad/CaseCard";
import type { AroBook, CaseRow } from "@/lib/recoveryDesk";

type Tab = "all" | "accident" | "thana" | "closed";

/**
 * Off-road management, on its own screen.
 *
 * The other half of an officer's day: everything that is off the road for a
 * reason that is not a repossession. Accident and custody are together on the
 * default view because an officer thinks "what have I got stuck" long before
 * they think "which of these is an accident" — the split is there when they
 * want it, not imposed before they ask.
 */
export function AroOffroad({ book }: { book: AroBook }) {
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");

  const b = useMemo(() => {
    const accident: CaseRow[] = [];
    const thana: CaseRow[] = [];
    const closed: CaseRow[] = [];
    for (const c of book.cases) {
      if (c.status !== "OPEN") closed.push(c);
      else if (c.kind === "ACCIDENT") accident.push(c);
      else thana.push(c);
    }

    // A flag from the desk outranks a late clock: the clock is a fact, the
    // flag is a person waiting on you. Then overdue, then least time left.
    const order = (rows: CaseRow[]) =>
      [...rows].sort((x, y) => {
        const score = (c: CaseRow) =>
          (c.openAttention ? 0 : 1) * 100 + (c.clock.overdue ? 0 : 1) * 10;
        return score(x) - score(y) || x.clock.daysLeft - y.clock.daysLeft;
      });

    return {
      accident: order(accident),
      thana: order(thana),
      all: order([...accident, ...thana]),
      closed,
    };
  }, [book.cases]);

  const q = search.trim().toLowerCase();
  const hit = (c: CaseRow) =>
    !q ||
    c.registrationNo.toLowerCase().includes(q) ||
    (c.make ?? "").toLowerCase().includes(q) ||
    (c.model ?? "").toLowerCase().includes(q) ||
    c.customerName.toLowerCase().includes(q) ||
    (c.territory?.name ?? "").toLowerCase().includes(q);

  const tabs: AroTab[] = [
    { key: "all", label: "All open", count: b.all.length },
    { key: "accident", label: "Accident", count: b.accident.length },
    { key: "thana", label: "Thana", count: b.thana.length },
    { key: "closed", label: "Closed", count: b.closed.length },
  ];

  const rows = (tab === "all" ? b.all : tab === "accident" ? b.accident : tab === "thana" ? b.thana : b.closed).filter(hit);

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-4">
      <AroHeader
        eyebrow="Off-road"
        title="Off-road cases"
        sub="Accidents and vehicles in police custody. Work them here — mark on-road, ask HQ for help, or convert to a capture."
      />
      <AroSearch value={search} onChange={setSearch} />
      <AroTabs tabs={tabs} value={tab} onChange={(k) => setTab(k as Tab)} />

      <AroList>
        <AroList.Rows
          rows={rows}
          empty={
            tab === "closed"
              ? "No closed cases yet."
              : tab === "thana"
                ? "No vehicles in police custody."
                : tab === "accident"
                  ? "No open accident cases."
                  : "Nothing off the road. Everything you hold is moving."
          }
          icon={tab === "thana" ? Landmark : tab === "closed" ? CheckCircle2 : tab === "all" ? Layers : CarFront}
          searching={!!q}
          render={(c: CaseRow) => (
            <CaseCard key={c.id} kase={c} viewer="field" readOnly={tab === "closed"} />
          )}
        />
      </AroList>

    </div>
  );
}

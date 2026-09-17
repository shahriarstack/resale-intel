"use client";

import { useMemo, useState } from "react";

import Link from "next/link";
import {
  ArrowRight,
  CarFront,
  CheckCircle2,
  FileClock,
  Flag,
  Gauge,
  Landmark,
  MailWarning,
  MapPin,
  Moon,
  Timer,
  TrendingUp,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { ConsolePage, ConsoleSection } from "@/components/recovery/ConsolePage";
import { TerritoryTable } from "@/components/recovery/TerritoryTable";
import { PartFilter, type PartChoice } from "@/components/recovery/PartFilter";
import {
  scopeManagerBook,
  summariseByTerritory,
  type TerritoryAnalytics,
} from "@/lib/recoveryRollup";
import type { ManagerBook } from "@/lib/recoveryDesk";

/**
 * The Recovery Manager's landing page.
 *
 * Summary, exceptions, analysis — and nothing operable. Every queue this desk
 * works now has its own route in the sidebar, so the dashboard stopped being a
 * container for six tabbed lists and became what a dashboard is for: telling
 * someone where to go before they go there.
 *
 * The one thing it does more than the old version is CROSS the segments.
 * National counts told a manager how many accident cases exist; they never
 * told them that seven of the eleven are in one territory, which is the only
 * form of that fact anybody can act on.
 *
 * The part filter governs the WHOLE page. Choosing Part A re-derives the six
 * headline figures, every exception row and the territory table from Part A's
 * records alone — see the note on `scoped` below for why it is recomputed
 * rather than adjusted.
 */
export function ManagerDashboard({
  book,
  territory,
}: {
  book: ManagerBook;
  territory: TerritoryAnalytics;
}) {
  const [part, setPart] = useState<PartChoice>("all");

  /**
   * The page, narrowed to the chosen half of the field.
   *
   * EVERY figure below comes from here — the six headline tiles, the exception
   * rows and the territory table alike. An earlier version scoped only the
   * table, on the argument that a rate belongs to the desk rather than to a
   * territory; in practice that produced a screen where the header answered a
   * national question and the table under it answered a regional one, with
   * nothing on the page saying which was which.
   *
   * Everything is RE-DERIVED from the surviving rows rather than adjusted.
   * That is the distinction that makes the number trustworthy: an approval
   * rate for Part A is the rate over Part A's requests, computed by the same
   * function the server uses on the whole book. The two cannot drift, because
   * they are one function.
   *
   * Free, in the sense that matters: the whole book is already in this
   * component, so narrowing it is a filter over memory rather than a round
   * trip — the page answers the press immediately, exactly as the three queue
   * surfaces beside it do.
   */
  const scopedBook = useMemo(() => scopeManagerBook(book, part), [book, part]);

  const scoped = useMemo(
    () =>
      part === "all"
        ? territory
        : summariseByTerritory(
            scopedBook.pipelineCaptures,
            [...scopedBook.openCases, ...scopedBook.closedCases],
            [...scopedBook.pendingRequests, ...scopedBook.decidedRequests],
            scopedBook.aroRoster,
          ),
    [part, territory, scopedBook],
  );

  /**
   * The counts on the control itself, always national.
   *
   * They have to be: they are what tells the manager how much of the field
   * each press would show them, and a count that moved with the selection
   * could never answer that.
   */
  const partCounts = useMemo(
    () => ({
      all: territory.rows.length,
      A: territory.rows.filter((r) => r.part === "A").length,
      B: territory.rows.filter((r) => r.part === "B").length,
    }),
    [territory],
  );

  const m = scopedBook.metrics;

  // The exception rows, in the order a supervisor should clear them: things
  // people are waiting on the desk for come before things the desk is merely
  // watching.
  const attention: {
    key: string;
    icon: LucideIcon;
    label: string;
    detail: string;
    count: number;
    tone: string;
    href: string;
  }[] = [];

  if (m.pendingRequests)
    attention.push({
      key: "req",
      icon: FileClock,
      label: "Capture requests awaiting your decision",
      detail: m.agedRequests
        ? `${m.agedRequests} have been waiting more than two days`
        : "Nothing seized until you rule",
      count: m.pendingRequests,
      tone: "#6a5acd",
      href: "/capture-requests",
    });

  if (m.openSupport)
    attention.push({
      key: "sup",
      icon: Flag,
      label: "Officers waiting on you for support",
      detail: "They cannot move these cases without something from HQ",
      count: m.openSupport,
      tone: "var(--accent)",
      href: "/offroad",
    });

  if (m.overdueCases)
    attention.push({
      key: "late",
      icon: Timer,
      label: "Cases past their window",
      detail: m.revisedCases
        ? `${m.revisedCases} have already been extended once`
        : "Revise the window, or flag the officer",
      count: m.overdueCases,
      tone: "var(--bad)",
      href: "/offroad",
    });

  if (m.staleCases)
    attention.push({
      key: "stale",
      icon: Moon,
      label: "Cases that have gone quiet",
      detail: "Open 14 days or more with no flag, no revision, no movement",
      count: m.staleCases,
      tone: "var(--ink-3)",
      href: "/offroad",
    });

  if (m.lettersOverdue)
    attention.push({
      key: "letters",
      icon: MailWarning,
      label: "Captures whose letter schedule has slipped",
      detail: "A missed letter delays the Credit Note that lands on this desk",
      count: m.lettersOverdue,
      tone: "var(--warn)",
      href: "/letter-watch",
    });

  return (
    <ConsolePage
      eyebrow="Recovery management"
      title="Recovery desk"
      icon={Gauge}
      intro="Where the fleet is, what is waiting on you, and which territory is carrying the problem."
      filter={<PartFilter value={part} onChange={setPart} counts={partCounts} />}
    >
      {/* ---- The book, in six figures ---- */}
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={<Truck size={16} />}
          tint="accent"
          ground="solid"
          label="Off the road"
          value={scoped.total.offroadTotal}
          caption={`${scoped.total.captured} captured`}
        />
        <StatTile
          icon={<Truck size={16} />}
          tint="info"
          ground="solid"
          label="In resale"
          value={scoped.total.resale}
          caption="cleared their CN"
        />
        <StatTile
          icon={<CarFront size={16} />}
          tint="warn"
          ground="solid"
          label="Accident"
          value={m.openAccident}
          caption="open cases"
        />
        <StatTile
          icon={<Landmark size={16} />}
          tint="bad"
          ground="solid"
          label="Thana"
          value={m.openThana}
          caption="in custody"
        />
        <StatTile
          icon={<Timer size={16} />}
          tint="bad"
          ground="solid"
          label="Past window"
          value={m.overdueCases}
          caption={`avg ${scoped.total.avgDays ?? 0}d off-road`}
        />
        <StatTile
          icon={<TrendingUp size={16} />}
          tint="ok"
          ground="solid"
          label="Approval rate"
          value={m.approvalRate ?? 0}
          display={m.approvalRate === null ? "—" : `${m.approvalRate}%`}
          caption="of requests ruled"
        />
      </div>

      {/* ---- Exceptions ---- */}
      <ConsoleSection
        title="Needs your attention"
        hint="Each row goes straight to the queue that owns it."
      >
        {attention.length === 0 ? (
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3.5"
            style={{ background: "color-mix(in srgb, var(--ok) 8%, var(--surface))" }}
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
              style={{
                background: "color-mix(in srgb, var(--ok) 15%, var(--surface))",
                color: "var(--ok)",
              }}
            >
              <CheckCircle2 size={18} />
            </span>
            <div>
              <div className="text-[14px] font-bold" style={{ color: "var(--ok)" }}>
                Nothing is waiting on you
              </div>
              <p className="text-[12px] text-ink-3">
                No pending approvals, no support requests, every case inside its window.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
            {attention.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="group flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors"
                style={{ background: `color-mix(in srgb, ${a.tone} 8%, var(--surface))` }}
              >
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
                  style={{
                    background: `color-mix(in srgb, ${a.tone} 15%, var(--surface))`,
                    color: a.tone,
                  }}
                >
                  <a.icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-ink">{a.label}</div>
                  <div className="truncate text-[11.5px] text-ink-3">{a.detail}</div>
                </div>
                <span
                  className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-2 font-mono text-[14px] font-bold tnum"
                  style={{ background: a.tone, color: "#fff" }}
                >
                  {a.count}
                </span>
                <ArrowRight
                  size={15}
                  className="shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: a.tone }}
                />
              </Link>
            ))}
          </div>
        )}
      </ConsoleSection>

      {/* ---- Territory analysis ----
          A territory here IS an officer, so this one table answers both "where
          is my problem" and "who do I ring about it". There is no second table
          by officer: it would be the same rows under a different heading, and
          two tables that must always agree are two tables that will one day
          disagree. */}
      <ConsoleSection
        title="By territory"
        hint="Each territory is one officer's patch. Read down a column to rank them; open a row to see exactly what is pending and whose move it is."
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <MapPin size={13} />
            {scoped.rows.length} territories
          </span>
        }
      >
        <TerritoryTable data={scoped} />
      </ConsoleSection>
    </ConsolePage>
  );
}

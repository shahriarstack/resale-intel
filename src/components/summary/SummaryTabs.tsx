"use client";

import { Map, Users } from "lucide-react";
import type { CoverageRow } from "@/lib/coverage";
import type { EngineerWorkloadRow } from "@/lib/repairs";
import { CoverageTable } from "@/components/coverage/CoverageTable";
import { EngineerWorkloadTable } from "@/components/repairs/EngineerWorkloadTable";
import { usePersistedEnum } from "@/lib/usePersisted";

/**
 * The BM's two readings of the book.
 *
 * Territory answers "where is the work"; engineer answers "who is holding it".
 * Both already exist as tables owned by the desks that live in them — this
 * mounts those same components rather than growing a third copy that drifts
 * from the other two.
 *
 * The tab is client state on purpose. The date window is a server round trip,
 * and pushing a new URL re-renders this component without unmounting it, so
 * the chosen tab survives a re-count. Putting the tab in the URL as well would
 * make two things fight over the same query string for no gain.
 */

type Tab = "territory" | "engineer";
const TABS = ["territory", "engineer"] as const;

export function SummaryTabs({
  rows,
  unmanned,
  workload,
  from,
  to,
}: {
  rows: CoverageRow[];
  unmanned: number;
  workload: EngineerWorkloadRow[];
  from: string;
  to: string;
}) {
  const [tab, setTab] = usePersistedEnum<Tab>("ri:summary:tab", TABS, "territory");

  const territoriesWithWork = rows.filter((r) => r.total > 0).length;
  const engineersWithWork = workload.filter((r) => r.assigned > 0).length;

  return (
    <div className="mx-auto w-full max-w-[1580px] px-5 pt-6 lg:px-7">
      <div className="mb-1">
        <div className="eyebrow text-accent">Oversight</div>
        <h1 className="page-title mt-1 text-[26px] sm:text-[30px]">Resale Pipeline Summary</h1>
        <p className="mt-1.5 max-w-prose text-[13.5px] text-ink-2">
          The resale pipeline two ways — by the territory it came from, and by the engineer holding
          it.
        </p>
      </div>

      <div className="mt-3.5 seg" role="group" aria-label="Summary view">
        <button
          className="seg-btn"
          data-on={tab === "territory"}
          aria-pressed={tab === "territory"}
          onClick={() => setTab("territory")}
        >
          <Map size={12} />
          By territory
          <span className="ml-1.5 font-mono text-[10px] opacity-60">{territoriesWithWork}</span>
        </button>
        <button
          className="seg-btn"
          data-on={tab === "engineer"}
          aria-pressed={tab === "engineer"}
          onClick={() => setTab("engineer")}
        >
          <Users size={12} />
          By engineer
          <span className="ml-1.5 font-mono text-[10px] opacity-60">{engineersWithWork}</span>
        </button>
      </div>

      {/* Both tables bring their own padded shell, so this wrapper undoes the
          horizontal padding rather than nesting one gutter inside another. */}
      <div className="-mx-5 lg:-mx-7">
        {tab === "territory" ? (
          <CoverageTable
            rows={rows}
            unmanned={unmanned}
            // The BM signs off the price, so the value of a territory's book
            // is squarely their business.
            canSeeValue
            from={from}
            to={to}
            basePath="/summary"
          />
        ) : (
          <div className="px-5 pb-6 lg:px-7">
            <EngineerWorkloadTable
              rows={workload}
              from={from}
              to={to}
              basePath="/summary"
            />
          </div>
        )}
      </div>
    </div>
  );
}

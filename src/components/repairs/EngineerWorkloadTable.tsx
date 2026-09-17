"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardList,
  RotateCcw,
  SearchX,
  Users,
} from "lucide-react";
import type { EngineerWorkloadRow } from "@/lib/repairs";
import { REPAIR_STAGES, REPAIR_STAGE_META } from "@/lib/repair";
import { takaCompact } from "@/lib/format";
import { DateRangeBar } from "@/components/ui/DateRangeBar";

/**
 * Engineer workload, on the Service Manager's dashboard.
 *
 * The desk inbox above it answers "what needs me right now". This answers the
 * question that inbox cannot: where is everything else, and who is holding it.
 *
 * One axis only. The date range filters on capture date, so every column reads
 * as "of the vehicles captured in this window, how many sit at this stage of
 * that engineer's work today". A period-based throughput count sitting beside
 * a point-in-time backlog count would look comparable and would not be.
 */

type SortKey =
  | "name"
  | "assigned"
  | "assessmentPending"
  | "awaitingApproval"
  | "inProgress"
  | "overdue"
  | "done"
  | "value";

export function EngineerWorkloadTable({
  rows,
  from,
  to,
  /** Where the date control pushes to — this table appears on more than one
   *  route, and the window has to come back to the page that owns it. */
  basePath = "/dashboard",
}: {
  rows: EngineerWorkloadRow[];
  from: string;
  to: string;
  basePath?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("assessmentPending");
  const [asc, setAsc] = useState(false);
  const [busyOnly, setBusyOnly] = useState(false);

  const shown = useMemo(() => {
    const list = busyOnly ? rows.filter((r) => r.assigned > 0) : rows;
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      const cmp =
        sortKey === "name"
          ? a.name.localeCompare(b.name)
          : sortKey === "value"
            ? a.valueInHand - b.valueInHand
            : (a[sortKey] as number) - (b[sortKey] as number);
      // Ties fall back to name so the row order is stable between renders.
      return (cmp || a.name.localeCompare(b.name) * (asc ? 1 : -1)) * dir;
    });
  }, [rows, busyOnly, sortKey, asc]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (t, r) => ({
          assigned: t.assigned + r.assigned,
          assessmentPending: t.assessmentPending + r.assessmentPending,
          drafted: t.drafted + r.drafted,
          rework: t.rework + r.rework,
          awaitingApproval: t.awaitingApproval + r.awaitingApproval,
          inProgress: t.inProgress + r.inProgress,
          overdue: t.overdue + r.overdue,
          done: t.done + r.done,
          upstream: t.upstream + r.upstream,
          released: t.released + r.released,
          value: t.value + r.valueInHand,
        }),
        {
          assigned: 0,
          assessmentPending: 0,
          drafted: 0,
          rework: 0,
          awaitingApproval: 0,
          inProgress: 0,
          overdue: 0,
          done: 0,
          upstream: 0,
          released: 0,
          value: 0,
        },
      ),
    [rows],
  );

  const toggle = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  };

  const idle = rows.filter((r) => r.assigned === 0).length;

  return (
    <section className="mt-5" aria-label="Engineer workload">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="eyebrow flex items-center gap-1.5">
          <Users size={11} />
          Engineer workload
        </h2>
        <span className="font-mono text-[10px] text-ink-3">
          {totals.assigned} {totals.assigned === 1 ? "file" : "files"} across {rows.length}{" "}
          {rows.length === 1 ? "engineer" : "engineers"}
        </span>
      </div>

      <div className="mb-2.5">
        <DateRangeBar from={from} to={to} basePath={basePath} label="Captured" />
      </div>

      {idle > 0 && (
        <button
          className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-3 transition-colors hover:text-accent"
          onClick={() => setBusyOnly((v) => !v)}
        >
          {busyOnly
            ? `Showing engineers with work · ${idle} idle hidden`
            : `${idle} engineer${idle === 1 ? "" : "s"} with nothing in this window · hide`}
        </button>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="dtable coverage-table w-full">
            <thead>
              <tr>
                <Head label="Engineer" k="name" sortKey={sortKey} asc={asc} onSort={toggle} sticky />
                <Head label="Assigned" k="assigned" sortKey={sortKey} asc={asc} onSort={toggle} num />
                <Head
                  label="Assessment pending"
                  k="assessmentPending"
                  sortKey={sortKey}
                  asc={asc}
                  onSort={toggle}
                  num
                  title="CN approved — waiting on this engineer to submit a cost analysis"
                />
                <Head
                  label="Awaiting approval"
                  k="awaitingApproval"
                  sortKey={sortKey}
                  asc={asc}
                  onSort={toggle}
                  num
                  title="Submitted and sitting on your desk"
                />
                <Head
                  label="Work in progress"
                  k="inProgress"
                  sortKey={sortKey}
                  asc={asc}
                  onSort={toggle}
                  num
                  title="Repair approved and running"
                />
                <th className="band-letter">Stage mix</th>
                <Head label="Overdue" k="overdue" sortKey={sortKey} asc={asc} onSort={toggle} num />
                <Head label="Done" k="done" sortKey={sortKey} asc={asc} onSort={toggle} num title="Cleared the workshop — registration done or beyond" />
                <Head label="Value in hand" k="value" sortKey={sortKey} asc={asc} onSort={toggle} num />
              </tr>
            </thead>

            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center">
                    <SearchX size={20} className="mx-auto mb-2 text-ink-3" />
                    <p className="text-[13px] text-ink-2">
                      No engineer has work captured in this window.
                    </p>
                  </td>
                </tr>
              ) : (
                shown.map((r) => (
                  <tr key={r.id} data-quiet={r.assigned === 0}>
                    <td className="coverage-sticky strong">
                      <span className="block truncate">{r.name}</span>
                      <span className="block font-mono text-[10px] text-ink-3">{r.staffId}</span>
                    </td>

                    <td className="num strong">
                      {r.assigned || <Zero />}
                      {(r.upstream > 0 || r.released > 0) && (
                        <span className="mt-1 flex justify-end gap-1.5 font-mono text-[9px] font-normal text-ink-3">
                          {r.upstream > 0 && (
                            <span title="Assigned but still with Recovery — has not reached the bench yet">
                              {r.upstream} upstream
                            </span>
                          )}
                          {r.released > 0 && (
                            <span title="Returned to the customer — will never reach the bench">
                              {r.released} released
                            </span>
                          )}
                        </span>
                      )}
                    </td>

                    {/* The backlog column carries its own qualifiers: a pending
                        pile that is mostly rework means something different
                        from one that is all fresh work. */}
                    <td className="num" data-tone={r.assessmentPending > 0 ? "warn" : "neutral"}>
                      {r.assessmentPending === 0 ? (
                        <Zero />
                      ) : (
                        <>
                          <span className="heat-cell">{r.assessmentPending}</span>
                          <span className="mt-1 flex justify-end gap-1.5 font-mono text-[9px] text-ink-3">
                            {r.drafted > 0 && (
                              <span className="flex items-center gap-0.5" title="Draft saved, not submitted">
                                <ClipboardList size={9} />
                                {r.drafted}
                              </span>
                            )}
                            {r.rework > 0 && (
                              <span
                                className="flex items-center gap-0.5 text-bad"
                                title="Sent back to be redone"
                              >
                                <RotateCcw size={9} />
                                {r.rework}
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </td>

                    <td className="num" data-tone={r.awaitingApproval > 0 ? "accent" : "neutral"}>
                      {r.awaitingApproval === 0 ? (
                        <Zero />
                      ) : (
                        <span className="heat-cell">{r.awaitingApproval}</span>
                      )}
                    </td>

                    <td className="num" data-tone={r.inProgress > 0 ? "ok" : "neutral"}>
                      {r.inProgress === 0 ? <Zero /> : <span className="heat-cell">{r.inProgress}</span>}
                    </td>

                    <td className="band-letter" style={{ minWidth: 120 }}>
                      <StageMix stages={r.stages} total={r.inProgress} />
                    </td>

                    <td className="num">
                      {r.overdue === 0 ? (
                        <Zero />
                      ) : (
                        <span className="inline-flex items-center gap-1 font-mono text-[11.5px] font-bold text-bad">
                          <AlertTriangle size={10} />
                          {r.overdue}
                        </span>
                      )}
                    </td>

                    <td className="num">{r.done || <Zero />}</td>

                    <td className="num tnum">
                      {r.valueInHand > 0 ? takaCompact(r.valueInHand) : <Zero />}
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {shown.length > 0 && (
              <tfoot>
                <tr>
                  <td className="coverage-sticky strong">All engineers</td>
                  <td className="num strong">
                    {totals.assigned}
                    {(totals.upstream > 0 || totals.released > 0) && (
                      <span className="mt-1 flex justify-end gap-1.5 font-mono text-[9px] font-normal text-ink-3">
                        {totals.upstream > 0 && <span>{totals.upstream} upstream</span>}
                        {totals.released > 0 && <span>{totals.released} released</span>}
                      </span>
                    )}
                  </td>
                  <td className="num strong">
                    {totals.assessmentPending || <Zero />}
                    {(totals.drafted > 0 || totals.rework > 0) && (
                      <span className="mt-1 flex justify-end gap-1.5 font-mono text-[9px] font-normal text-ink-3">
                        {totals.drafted > 0 && <span>{totals.drafted} drafted</span>}
                        {totals.rework > 0 && <span className="text-bad">{totals.rework} rework</span>}
                      </span>
                    )}
                  </td>
                  <td className="num strong">{totals.awaitingApproval || <Zero />}</td>
                  <td className="num strong">{totals.inProgress || <Zero />}</td>
                  <td className="band-letter" />
                  <td className="num strong" style={{ color: totals.overdue ? "var(--bad)" : undefined }}>
                    {totals.overdue || <Zero />}
                  </td>
                  <td className="num strong">{totals.done || <Zero />}</td>
                  <td className="num strong tnum">
                    {totals.value > 0 ? takaCompact(totals.value) : <Zero />}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-3">
        Every column counts vehicles captured in the selected window, at the stage they have reached
        today. Pending, awaiting, in-progress and done sum to Assigned once upstream and released
        files are added back.
        {" "}
        <ClipboardList size={9} className="inline" /> drafted ·{" "}
        <RotateCcw size={9} className="inline" /> sent back for rework.
      </p>
    </section>
  );
}

/** A zero that recedes, so the numbers that matter carry the weight. */
function Zero() {
  return <span className="text-ink-3 opacity-40">·</span>;
}

/** The stage mix across one engineer's running repairs. */
function StageMix({ stages, total }: { stages: Record<string, number>; total: number }) {
  if (total === 0) {
    return <span className="font-mono text-[9.5px] text-ink-3">—</span>;
  }

  const parts = [
    ...REPAIR_STAGES.map((s) => ({
      key: s,
      label: REPAIR_STAGE_META[s].label,
      tone: REPAIR_STAGE_META[s].tone,
      count: stages[s] ?? 0,
    })),
    {
      key: "UNREPORTED",
      label: "Not reported",
      tone: "neutral" as const,
      count: stages.UNREPORTED ?? 0,
    },
  ].filter((p) => p.count > 0);

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
      <span className="mt-1 block truncate font-mono text-[9px] text-ink-3">
        {parts.map((p) => `${p.label} ${p.count}`).join(" · ")}
      </span>
    </>
  );
}

function Head({
  label,
  k,
  sortKey,
  asc,
  onSort,
  num,
  sticky,
  title,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  num?: boolean;
  sticky?: boolean;
  title?: string;
}) {
  return (
    <th
      className={`sortable group ${num ? "num" : ""} ${sticky ? "coverage-sticky" : ""}`}
      onClick={() => onSort(k)}
      title={title}
    >
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

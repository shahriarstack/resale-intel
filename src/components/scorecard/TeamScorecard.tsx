"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpDown,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Timer,
  Users,
  Wrench,
} from "lucide-react";
import { getJSON } from "@/lib/http";
import type {
  EngineerScorecard as Card,
  TeamScorecard as Team,
  TeamScorecardRow,
} from "@/lib/scorecard";
import { EngineerScorecard } from "@/components/scorecard/EngineerScorecard";
import { Delta, MonthScrubber, span, spanShort } from "@/components/scorecard/parts";

/**
 * The Service Manager's monthly scorecard.
 *
 * The workload table beside this one is a snapshot — where every file sits
 * right now. It cannot answer the question a head actually gets asked at the
 * end of a month: who got through how much, and how quickly. That is this tab.
 *
 * The order is deliberate. The plot comes before the table because the plot is
 * the diagnosis and the table is the evidence: a head glancing at it should see
 * the SHAPE of the workshop — who is fast and busy, who is busy and slow, who
 * has quietly stopped — in one look, and only then read the rows. Ranking the
 * table by volume alone and stopping there would have made speed invisible,
 * which is exactly how a workshop ends up rewarding the wrong thing.
 *
 * Any row opens the engineer's own card — the identical view that engineer
 * sees. One set of numbers, one interpretation, no separate management figure
 * that the person being measured has never seen.
 */

type SortKey = "name" | "assigned" | "completed" | "avgHours" | "open";

export function TeamScorecard({ initial }: { initial: Team }) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("completed");
  const [asc, setAsc] = useState(false);
  const [drill, setDrill] = useState<Card | null>(null);
  const [drilling, setDrilling] = useState<string | null>(null);

  const wanted = useRef(initial.monthKey);

  const load = useCallback(async (month: string) => {
    wanted.current = month;
    setBusy(true);
    setError("");
    try {
      const next = await getJSON<Team>(`/api/scorecard?scope=team&month=${month}`);
      if (wanted.current === month) setData(next);
    } catch (e) {
      if (wanted.current === month) {
        setError(e instanceof Error ? e.message : "Could not load that month");
      }
    } finally {
      if (wanted.current === month) setBusy(false);
    }
  }, []);

  const openEngineer = useCallback(
    async (id: string) => {
      setDrilling(id);
      setError("");
      try {
        setDrill(
          await getJSON<Card>(
            `/api/scorecard?scope=engineer&engineerId=${encodeURIComponent(id)}&month=${data.monthKey}`,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not open that engineer");
      } finally {
        setDrilling(null);
      }
    },
    [data.monthKey],
  );

  const rows = useMemo(() => {
    const dir = asc ? 1 : -1;
    return [...data.rows].sort((a, b) => {
      const cmp =
        sort === "name"
          ? b.engineer.name.localeCompare(a.engineer.name)
          : sort === "open"
            ? a.openNow - b.openNow
            : sort === "avgHours"
              // Unmeasured months sort to the bottom either way rather than
              // pretending to be the fastest engineer in the shop.
              ? (a.current.avgHours ?? Number.MAX_SAFE_INTEGER) -
                (b.current.avgHours ?? Number.MAX_SAFE_INTEGER)
              : a.current[sort] - b.current[sort];
      return (cmp || a.engineer.name.localeCompare(b.engineer.name) * -1) * dir;
    });
  }, [data.rows, sort, asc]);

  const active = data.rows.filter((r) => r.current.assigned > 0 || r.current.completed > 0);

  if (drill) {
    return (
      <div className="mt-5">
        <button className="btn btn-ghost btn-sm mb-3" onClick={() => setDrill(null)}>
          <ArrowLeft size={13} /> Back to the workshop
        </button>
        <div className="mb-3">
          <h2 className="font-display text-[17px] font-bold text-ink">{drill.engineer.name}</h2>
          <p className="font-mono text-[11px] text-ink-3">
            {drill.engineer.staffId} · the same card this engineer sees
          </p>
        </div>
        <EngineerScorecard initial={drill} engineerId={drill.engineer.id} />
      </div>
    );
  }

  return (
    <section className="mt-5" aria-label="Monthly scorecard">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="eyebrow">Monthly scorecard</h2>
          <p className="mt-1 text-[12px] text-ink-2">
            Jobs assigned, jobs completed and the time each took — by engineer, month by month.
          </p>
        </div>
      </div>

      <MonthScrubber
        months={data.months}
        value={data.monthKey}
        onChange={(m) => m !== data.monthKey && load(m)}
        busy={busy}
      />

      {error && <p className="sc-error mt-2">{error}</p>}

      {/* ---- Workshop totals ---- */}
      <div className="sc-totals mt-3">
        <Total
          icon={<ClipboardCheck size={13} />}
          label="Assigned"
          value={String(data.total.assigned)}
          delta={<Delta from={data.previousTotal?.assigned} to={data.total.assigned} />}
          caption="jobs landed on a bench"
        />
        <Total
          icon={<CheckCircle2 size={13} />}
          label="Completed"
          value={String(data.total.completed)}
          delta={<Delta from={data.previousTotal?.completed} to={data.total.completed} />}
          caption="jobs closed in the month"
        />
        <Total
          icon={<Timer size={13} />}
          label="Avg time"
          value={span(data.total.avgHours)}
          delta={
            <Delta
              from={data.previousTotal?.avgHours}
              to={data.total.avgHours}
              lowerIsBetter
              hours
            />
          }
          caption={`median ${span(data.total.medianHours)}`}
        />
        <Total
          icon={<Users size={13} />}
          label="Working"
          value={`${active.length}/${data.rows.length}`}
          delta={
            <span className="sc-delta" data-tone="flat">
              {data.total.carried} carried forward
            </span>
          }
          caption="engineers with work this month"
        />
      </div>

      {/* ---- The shape of the workshop ---- */}
      <WorkshopPlot rows={data.rows} onOpen={openEngineer} />

      {/* ---- Rows ---- */}
      <div className="card mt-3 overflow-hidden" data-busy={busy}>
        <div className="overflow-x-auto">
        <table className="dtable sc-table w-full">
          <thead>
            <tr>
              <Th label="Engineer" k="name" sort={sort} asc={asc} set={setSort} flip={setAsc} align="left" />
              <Th label="Assigned" k="assigned" sort={sort} asc={asc} set={setSort} flip={setAsc} />
              <Th label="Completed" k="completed" sort={sort} asc={asc} set={setSort} flip={setAsc} />
              <th className="text-right" title="Of the jobs that landed this month, how many are finished today">Cleared</th>
              <Th label="Avg time" k="avgHours" sort={sort} asc={asc} set={setSort} flip={setAsc} />
              <th className="text-right">Split</th>
              <th className="text-right">On time</th>
              <Th label="Open now" k="open" sort={sort} asc={asc} set={setSort} flip={setAsc} />
              <th className="sc-spark-head">12 months</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row
                key={r.engineer.id}
                row={r}
                busy={drilling === r.engineer.id}
                onOpen={() => openEngineer(r.engineer.id)}
              />
            ))}
          </tbody>
        </table>
        </div>
        <div className="sc-table-foot">
          Assigned counts jobs that landed in {data.total.label}. Completed counts jobs closed in
          it, whenever they started — so the two are not a funnel, and completing more than
          arrived means a backlog came down.
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function Total({
  icon,
  label,
  value,
  delta,
  caption,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: React.ReactNode;
  caption: string;
}) {
  return (
    <div className="sc-total">
      <div className="sc-total-head">
        {icon}
        {label}
      </div>
      <div className="sc-total-value">{value}</div>
      <div className="sc-total-foot">
        {delta}
        <span>{caption}</span>
      </div>
    </div>
  );
}

function Th({
  label,
  k,
  sort,
  asc,
  set,
  flip,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  asc: boolean;
  set: (k: SortKey) => void;
  flip: (a: boolean) => void;
  align?: "left" | "right";
}) {
  const on = sort === k;
  return (
    <th
      className={`sortable group ${align === "left" ? "" : "text-right"}`}
      onClick={() => {
        if (on) flip(!asc);
        else {
          set(k);
          flip(false);
        }
      }}
    >
      {label}
      <ArrowUpDown
        size={10}
        className={`ml-1 inline ${on ? "text-accent" : "opacity-0 transition-opacity group-hover:opacity-60"}`}
      />
    </th>
  );
}

function Row({
  row,
  busy,
  onOpen,
}: {
  row: TeamScorecardRow;
  busy: boolean;
  onOpen: () => void;
}) {
  const c = row.current;
  const finished = c.onTime + c.late;
  const onTimePct = finished ? Math.round((c.onTime / finished) * 100) : null;
  const cleared = c.assigned ? Math.round((c.cohortDone / c.assigned) * 100) : null;
  const idle = c.assigned === 0 && c.completed === 0;

  return (
    <tr className="sc-row" data-idle={idle} data-busy={busy} onClick={onOpen}>
      <td className="text-left">
        <span className="sc-name">{row.engineer.name}</span>
        <span className="sc-staff">{row.engineer.staffId}</span>
      </td>
      <td className="tnum text-right">{c.assigned || <span className="text-ink-3">—</span>}</td>
      <td className="tnum text-right">
        <span className="sc-cell-strong">{c.completed || 0}</span>
        <Delta from={row.previous?.completed} to={c.completed} />
      </td>
      <td className="tnum text-right">
        {cleared === null ? <span className="text-ink-3">—</span> : `${cleared}%`}
      </td>
      <td className="tnum text-right">
        <span className="sc-cell-strong">{span(c.avgHours)}</span>
        <Delta from={row.previous?.avgHours} to={c.avgHours} lowerIsBetter hours />
      </td>
      <td className="text-right">
        {/* Assessment vs repair, so a low count next to a long average is
            readable as "three engine rebuilds", not as slowness. */}
        <span className="sc-split">
          <span title={`${c.assessment.completed} assessments`}>
            <ClipboardCheck size={10} /> {c.assessment.completed}
          </span>
          <span title={`${c.repair.completed} repairs`}>
            <Wrench size={10} /> {c.repair.completed}
          </span>
        </span>
      </td>
      <td className="tnum text-right">
        {onTimePct === null ? (
          <span className="text-ink-3">—</span>
        ) : (
          <span style={{ color: onTimePct >= 80 ? "var(--ok)" : onTimePct >= 50 ? "var(--warn)" : "var(--bad)" }}>
            {onTimePct}%
          </span>
        )}
      </td>
      <td className="tnum text-right">{row.openNow || <span className="text-ink-3">—</span>}</td>
      <td>
        <Spark points={row.spark} />
      </td>
    </tr>
  );
}

/** A twelve-column completed-per-month spark, sized to sit inside a table row. */
function Spark({ points }: { points: { key: string; completed: number }[] }) {
  const peak = Math.max(1, ...points.map((p) => p.completed));
  return (
    <span className="sc-spark">
      {points.map((p, i) => (
        <span
          key={p.key}
          className="sc-spark-bar"
          data-last={i === points.length - 1}
          data-empty={p.completed === 0}
          style={{ height: p.completed === 0 ? 2 : Math.max(3, (p.completed / peak) * 22) }}
          title={`${p.key}: ${p.completed}`}
        />
      ))}
    </span>
  );
}

/**
 * The workshop plot.
 *
 * Volume across, pace up. Faster is higher, so the top-right corner is the
 * good corner and no legend is needed to know which way to want to move.
 *
 * The cross-hairs are the shop's own medians rather than a target somebody
 * invented, which makes the quadrants mean something specific: right of the
 * vertical is "carrying more than half the shop", above the horizontal is
 * "turning it round quicker than half the shop". A head reading this is
 * looking for two things — a dot alone in the bottom-right (working hard,
 * losing time somewhere) and a dot that has drifted down since last month.
 */
function WorkshopPlot({
  rows,
  onOpen,
}: {
  rows: TeamScorecardRow[];
  onOpen: (id: string) => void;
}) {
  const plotted = rows.filter((r) => r.current.completed > 0 && r.current.avgHours !== null);
  const idle = rows.filter((r) => r.current.completed === 0);

  if (plotted.length < 2) {
    return (
      <div className="sc-plot-empty mt-3">
        {plotted.length === 0
          ? "No engineer completed a job in this month, so there is nothing to plot."
          : "One engineer completed work this month — the plot needs at least two to compare."}
      </div>
    );
  }

  const W = 640;
  const H = 220;
  const PAD = { l: 46, r: 16, t: 14, b: 30 };

  const maxDone = Math.max(...plotted.map((r) => r.current.completed));
  const maxHours = Math.max(...plotted.map((r) => r.current.avgHours!));
  const minHours = Math.min(...plotted.map((r) => r.current.avgHours!));
  // A flat month would otherwise divide by zero and stack every dot on one line.
  const hourSpread = Math.max(1, maxHours - minHours);

  const x = (done: number) => PAD.l + (done / Math.max(1, maxDone)) * (W - PAD.l - PAD.r);
  const y = (hours: number) =>
    PAD.t + ((hours - minHours) / hourSpread) * (H - PAD.t - PAD.b);

  const mid = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const medDone = mid(plotted.map((r) => r.current.completed));
  const medHours = mid(plotted.map((r) => r.current.avgHours!));

  return (
    <div className="sc-plot mt-3">
      <div className="sc-sec">
        <span className="sc-sec-title">
          <Gauge size={12} />
          The shape of the workshop
        </span>
        <span className="sc-sec-meta">volume across · faster is higher</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Engineers plotted by jobs completed against average time">
        {/* Quadrant cross-hairs at the shop medians */}
        <line x1={x(medDone)} y1={PAD.t} x2={x(medDone)} y2={H - PAD.b} stroke="var(--rule-strong)" strokeDasharray="3 4" />
        <line x1={PAD.l} y1={y(medHours)} x2={W - PAD.r} y2={y(medHours)} stroke="var(--rule-strong)" strokeDasharray="3 4" />

        {/* Axis frame */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--rule)" />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--rule)" />

        <text x={PAD.l - 8} y={PAD.t + 4} textAnchor="end" className="sc-plot-axis">
          {spanShort(minHours)}
        </text>
        <text x={PAD.l - 8} y={H - PAD.b} textAnchor="end" className="sc-plot-axis">
          {spanShort(maxHours)}
        </text>
        <text x={W - PAD.r} y={H - PAD.b + 18} textAnchor="end" className="sc-plot-axis">
          {maxDone} completed
        </text>
        <text x={PAD.l} y={H - PAD.b + 18} textAnchor="start" className="sc-plot-axis">
          0
        </text>

        {plotted.map((r) => {
          const cx = x(r.current.completed);
          const cy = y(r.current.avgHours!);
          const good = r.current.avgHours! <= medHours && r.current.completed >= medDone;
          const poor = r.current.avgHours! > medHours && r.current.completed < medDone;
          return (
            <g
              key={r.engineer.id}
              className="sc-dot"
              onClick={() => onOpen(r.engineer.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onOpen(r.engineer.id)}
            >
              <title>
                {`${r.engineer.name}: ${r.current.completed} completed, ${span(r.current.avgHours)} average`}
              </title>
              <circle
                cx={cx}
                cy={cy}
                r="13"
                fill={good ? "var(--ok-soft)" : poor ? "var(--warn-soft)" : "var(--accent-soft)"}
                stroke={good ? "var(--ok)" : poor ? "var(--warn)" : "var(--accent)"}
                strokeWidth="1.6"
              />
              <text x={cx} y={cy + 3.5} textAnchor="middle" className="sc-dot-text">
                {initials(r.engineer.name)}
              </text>
            </g>
          );
        })}
      </svg>

      {idle.length > 0 && (
        <p className="sc-plot-note">
          Not plotted — nothing completed this month: {idle.map((r) => r.engineer.name).join(", ")}.
        </p>
      )}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  ChevronDown,
  ClipboardCheck,
  Flame,
  Gauge,
  RotateCcw,
  Timer,
  TrendingUp,
  Trophy,
  Wrench,
} from "lucide-react";
import { getJSON } from "@/lib/http";
import { shortDate } from "@/lib/format";
import type { EngineerScorecard as Card, JobRow, MonthStat } from "@/lib/scorecard";
import {
  Delta,
  FlowBar,
  MonthScrubber,
  PaceGauge,
  TrendRidge,
  span,
  spanShort,
} from "@/components/scorecard/parts";

/**
 * "My month" — the engineer's own record.
 *
 * The rest of the workbench is a queue: it tells an engineer what to do next
 * and says nothing at all about how they are doing. This tab is the other half.
 * It has one job, and a strong opinion about how to do it:
 *
 *   It must be honest before it is encouraging. A view built to flatter gets
 *   read once. So the clock only ever runs while the work was actually the
 *   engineer's (see lib/scorecard.ts), a bad month is allowed to look like a
 *   bad month, and every headline figure can be expanded into the individual
 *   jobs it was computed from. A number you can open is a number you can trust.
 *
 *   It compares against the reader's own past first, and the shop second.
 *   "Faster than last month" is something a person can act on; a league table
 *   is mostly something they can resent. The team mark is on the gauge because
 *   context is fair, but the ranking is one quiet line near the bottom.
 *
 * Everything except the initial render is fetched, not navigated, so scrubbing
 * through the year never costs the engineer their place in the workbench.
 */
export function EngineerScorecard({
  initial,
  /** Set when the Service Manager is looking at someone else's card. Absent means
   *  "me", and the API then takes the engineer from the session rather than
   *  from anything the browser could edit. */
  engineerId,
}: {
  initial: Card;
  engineerId?: string;
}) {
  const [data, setData] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Guards against a slow response for March landing after a fast one for
  // April and quietly repainting the wrong month.
  const wanted = useRef(initial.monthKey);

  const load = useCallback(async (month: string) => {
    wanted.current = month;
    setBusy(true);
    setError("");
    try {
      const query = engineerId
        ? `scope=engineer&engineerId=${encodeURIComponent(engineerId)}`
        : "scope=me";
      const next = await getJSON<Card>(`/api/scorecard?${query}&month=${month}`);
      if (wanted.current === month) setData(next);
    } catch (e) {
      if (wanted.current === month) {
        setError(e instanceof Error ? e.message : "Could not load that month");
      }
    } finally {
      if (wanted.current === month) setBusy(false);
    }
  }, [engineerId]);

  const { current, previous } = data;

  return (
    <div className="space-y-3">
      <MonthScrubber
        months={data.months}
        value={data.monthKey}
        onChange={(m) => m !== data.monthKey && load(m)}
        busy={busy}
      />

      {error && <p className="sc-error">{error}</p>}

      <Headline card={data} />

      {/* ---- The instrument ----
          Pace on the left, volume on the right. The gauge is the one figure the
          engineer is being asked to move, so it gets the space. */}
      <section className="sc-card sc-hero" data-busy={busy}>
        <PaceGauge
          hours={current.avgHours}
          teamHours={data.team.avgHours}
          bestHours={data.best.avgHours?.value ?? null}
          scaleMax={gaugeScale(data)}
          caption={paceCaption(data)}
        />
        <div className="sc-hero-side">
          <Reading
            label="Completed"
            value={current.completed}
            caption="jobs finished this month"
            delta={<Delta from={previous?.completed} to={current.completed} />}
            tone="ok"
          />
          <Reading
            label="Assigned"
            value={current.assigned}
            caption="landed on your bench"
            delta={<Delta from={previous?.assigned} to={current.assigned} />}
            tone="accent"
          />
          <Reading
            label="Avg time"
            display={span(current.avgHours)}
            caption="start to finish"
            delta={
              <Delta
                from={previous?.avgHours}
                to={current.avgHours}
                lowerIsBetter
                hours
              />
            }
            tone="warn"
          />
        </div>
      </section>

      {/* ---- In versus out ---- */}
      <section className="sc-card">
        <SectionHead icon={<TrendingUp size={12} />} title="In and out" meta={current.label} />
        <FlowBar stat={current} />
      </section>

      {/* ---- The two kinds of work ---- */}
      <section className="sc-card">
        <SectionHead
          icon={<Gauge size={12} />}
          title="Where the time went"
          meta="assessment vs repair"
        />
        <KindRow
          icon={<ClipboardCheck size={14} />}
          label="Assessments"
          blurb="Credit Note approved → estimate submitted"
          stat={current.assessment}
          tone="var(--cat-assess)"
        />
        <KindRow
          icon={<Wrench size={14} />}
          label="Repairs"
          blurb="Repair approved → reported ready"
          stat={current.repair}
          tone="var(--cat-repair)"
        />
      </section>

      {/* ---- Twelve months ---- */}
      <section className="sc-card">
        <SectionHead
          icon={<TrendingUp size={12} />}
          title="Last 12 months"
          meta="tap a month"
        />
        <TrendRidge
          points={data.history.map((h) => ({
            key: h.key,
            short: h.label.slice(0, 3),
            completed: h.completed,
            avgHours: h.avgHours,
          }))}
          selected={data.monthKey}
          onSelect={(m) => m !== data.monthKey && load(m)}
        />
        <div className="sc-legend">
          <span><i className="sc-key" style={{ background: "var(--cat-repair)" }} /> jobs completed</span>
          <span><i className="sc-key" style={{ background: "var(--ink-3)" }} /> average time</span>
        </div>
      </section>

      {/* ---- How the work landed ---- */}
      <Quality stat={current} />

      {/* ---- Marks ---- */}
      <Marks card={data} />

      {/* ---- Receipts ---- */}
      <Receipts jobs={data.jobs} month={current.label} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The gauge's scale.
 *
 * Fixed against the engineer's own worst measured month and the shop mark, not
 * against the current reading — a scale that rebases every month would make
 * every needle land in the middle and the instrument would say nothing.
 */
function gaugeScale(card: Card): number {
  const candidates = [
    ...card.history.map((h) => h.avgHours ?? 0),
    card.team.avgHours ?? 0,
    card.current.avgHours ?? 0,
  ];
  return Math.max(24, Math.ceil((Math.max(...candidates) * 1.2) / 12) * 12);
}

function paceCaption(card: Card): string {
  const mine = card.current.avgHours;
  const shop = card.team.avgHours;
  if (mine === null) return "No job finished this month, so there is nothing to time yet.";
  if (shop === null) return `Your average across ${card.current.completed} completed ${card.current.completed === 1 ? "job" : "jobs"}.`;
  const diff = mine - shop;
  if (Math.abs(diff) < 1) return "Running level with the shop average.";
  return diff < 0
    ? `${spanShort(Math.abs(diff))} faster than the shop average.`
    : `${spanShort(diff)} slower than the shop average.`;
}

/**
 * One sentence at the top, chosen from the month itself.
 *
 * It leads with whatever is genuinely the most notable thing — a record, a
 * backlog cleared, a slip — rather than always congratulating. The tone
 * follows the fact; when the month was poor the line says so plainly, because
 * a card that only ever cheers is a card nobody believes about anything.
 */
function Headline({ card }: { card: Card }) {
  const c = card.current;
  const p = card.previous;

  let tone: "ok" | "accent" | "warn" | "neutral" = "accent";
  let text: string;

  if (c.completed === 0 && c.assigned === 0) {
    tone = "neutral";
    text = `Nothing was assigned to you in ${c.label}${card.openNow > 0 ? `, though ${card.openNow} ${card.openNow === 1 ? "job is" : "jobs are"} open right now.` : "."}`;
  } else if (c.completed === 0) {
    tone = "warn";
    text = `${c.assigned} ${c.assigned === 1 ? "job" : "jobs"} landed in ${c.label} and none closed inside the month.`;
  } else if (card.best.completed && card.best.completed.key === c.key && c.completed > 1) {
    tone = "ok";
    text = `${c.completed} completed — your best month in the last year.`;
  } else if (card.best.avgHours && card.best.avgHours.key === c.key && c.completed > 1) {
    tone = "ok";
    text = `Fastest month in the last year: ${span(c.avgHours)} average across ${c.completed} jobs.`;
  } else if (c.completed > c.assigned) {
    tone = "ok";
    text = `Closed ${c.completed} against ${c.assigned} arriving — you took the backlog down.`;
  } else if (p && p.avgHours !== null && c.avgHours !== null && c.avgHours < p.avgHours * 0.85) {
    tone = "ok";
    text = `${spanShort(p.avgHours - c.avgHours)} quicker per job than ${p.label}.`;
  } else if (p && p.avgHours !== null && c.avgHours !== null && c.avgHours > p.avgHours * 1.25) {
    tone = "warn";
    text = `Jobs took ${spanShort(c.avgHours - p.avgHours)} longer on average than in ${p.label}.`;
  } else if (c.reworks > 0) {
    tone = "warn";
    text = `${c.completed} completed. ${c.reworks} of the month's work was an assessment sent back to be redone.`;
  } else {
    text = `${c.completed} completed, averaging ${span(c.avgHours)} a job.`;
  }

  return (
    <div className="sc-headline" data-tone={tone}>
      <span className="sc-headline-glyph">
        {tone === "ok" ? <Trophy size={15} /> : tone === "warn" ? <Timer size={15} /> : <Gauge size={15} />}
      </span>
      <p>{text}</p>
    </div>
  );
}

function SectionHead({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <div className="sc-sec">
      <span className="sc-sec-title">
        {icon}
        {title}
      </span>
      {meta && <span className="sc-sec-meta">{meta}</span>}
    </div>
  );
}

function Reading({
  label,
  value,
  display,
  caption,
  delta,
  tone,
}: {
  label: string;
  value?: number;
  display?: string;
  caption: string;
  delta: React.ReactNode;
  tone: "ok" | "accent" | "warn";
}) {
  return (
    <div className="sc-read" data-tone={tone}>
      <div className="sc-read-label">{label}</div>
      <div className="sc-read-value">{display ?? value}</div>
      <div className="sc-read-foot">
        {delta}
        <span className="sc-read-caption">{caption}</span>
      </div>
    </div>
  );
}

function KindRow({
  icon,
  label,
  blurb,
  stat,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  blurb: string;
  stat: { assigned: number; completed: number; avgHours: number | null };
  tone: string;
}) {
  return (
    <div className="sc-kind" style={{ ["--kind" as string]: tone }}>
      <span className="sc-kind-glyph">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="sc-kind-head">
          <span className="sc-kind-label">{label}</span>
          {/* Done and arrived, not "n of m". They are different cohorts — a
              job closed this month may have arrived in April — and a fraction
              would quietly assert they are the same set. */}
          <span className="sc-kind-count">
            {stat.completed}
            <span className="sc-kind-of"> done · {stat.assigned} in</span>
          </span>
        </div>
        <p className="sc-kind-blurb">{blurb}</p>
      </div>
      <span className="sc-kind-time">{stat.avgHours === null ? "—" : span(stat.avgHours)}</span>
    </div>
  );
}

/**
 * Quality, kept separate from volume.
 *
 * Speed alone is a bad target — the fastest way to close an assessment is to
 * do it badly and have it sent back. These two figures are the counterweight,
 * and they are shown next to the pace figures for exactly that reason.
 */
function Quality({ stat }: { stat: MonthStat }) {
  const finishedRepairs = stat.onTime + stat.late;
  if (finishedRepairs === 0 && stat.reworks === 0) return null;
  const pct = finishedRepairs ? Math.round((stat.onTime / finishedRepairs) * 100) : null;

  return (
    <section className="sc-card">
      <SectionHead icon={<Award size={12} />} title="How the work landed" />
      <div className="sc-quality">
        {pct !== null && (
          <div className="sc-quality-item">
            <div className="sc-quality-value" style={{ color: pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--warn)" : "var(--bad)" }}>
              {pct}%
            </div>
            <div className="sc-quality-label">repairs inside deadline</div>
            <div className="sc-quality-meta">{stat.onTime} on time · {stat.late} late</div>
          </div>
        )}
        <div className="sc-quality-item">
          <div className="sc-quality-value" style={{ color: stat.reworks === 0 ? "var(--ok)" : "var(--warn)" }}>
            {stat.reworks}
          </div>
          <div className="sc-quality-label">sent back to redo</div>
          <div className="sc-quality-meta">
            {stat.reworks === 0
              ? "nothing came back this month"
              : "counted as extra work that need not have existed"}
          </div>
        </div>
      </div>
    </section>
  );
}

/** Records and standing. The one place the shop is a league table, kept small. */
function Marks({ card }: { card: Card }) {
  const { best, team, lifetime } = card;
  if (!best.completed && !best.avgHours && lifetime.completed === 0) return null;

  return (
    <section className="sc-card">
      <SectionHead icon={<Flame size={12} />} title="Your marks" meta="last 12 months" />
      <ul className="sc-marks">
        {best.completed && (
          <li>
            <Trophy size={13} />
            <span>
              Busiest month <b>{best.completed.value} completed</b> in{" "}
              {monthName(card, best.completed.key)}
            </span>
          </li>
        )}
        {best.avgHours && (
          <li>
            <Timer size={13} />
            <span>
              Quickest month <b>{span(best.avgHours.value)}</b> a job in{" "}
              {monthName(card, best.avgHours.key)}
            </span>
          </li>
        )}
        {card.current.fastest && (
          <li>
            <Gauge size={13} />
            <span>
              Quickest job this month <b>{span(card.current.fastest.hours)}</b> ·{" "}
              {card.current.fastest.label}
            </span>
          </li>
        )}
        <li>
          <Award size={13} />
          <span>
            <b>{lifetime.completed}</b> jobs completed on record
            {lifetime.avgHours !== null && <> · {span(lifetime.avgHours)} average</>}
          </span>
        </li>
        {team.rank !== null && team.engineers > 1 && (
          <li>
            <TrendingUp size={13} />
            <span>
              {ordinal(team.rank)} of {team.engineers} on volume this month
              {team.medianCompleted !== null && <> · shop median {team.medianCompleted}</>}
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}

function monthName(card: Card, key: string): string {
  return card.history.find((h) => h.key === key)?.label ?? key;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

/**
 * The jobs behind the number.
 *
 * Collapsed by default — it is evidence, not the point — but present, because
 * the fastest way to make someone distrust a performance figure is to give
 * them no way to check it.
 */
function Receipts({ jobs, month }: { jobs: JobRow[]; month: string }) {
  const [open, setOpen] = useState(false);

  // A month change swaps the list underneath an open panel; closing it would
  // be a surprise, so it stays open and simply shows the new month.
  const summary = useMemo(() => {
    if (jobs.length === 0) return "nothing completed";
    return `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"}`;
  }, [jobs]);

  return (
    <section className="sc-card">
      <button
        type="button"
        className="sc-receipt-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="sc-sec-title">
          <ClipboardCheck size={12} />
          What made up {month}
        </span>
        <span className="sc-receipt-meta">
          {summary}
          <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </span>
      </button>

      {open && (
        <div className="sc-receipts">
          {jobs.length === 0 ? (
            <p className="sc-empty">No job was completed in this month.</p>
          ) : (
            jobs.map((j) => (
              <Link key={j.id} href={`/vehicles/${j.vehicleId}`} className="sc-job">
                <span className="sc-job-glyph" data-kind={j.kind}>
                  {j.kind === "assessment" ? <ClipboardCheck size={13} /> : <Wrench size={13} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="sc-job-name">{j.name}</span>
                  <span className="sc-job-sub">
                    {j.registrationNo} · closed {shortDate(j.endedAt)}
                  </span>
                </span>
                <span className="sc-job-tags">
                  {j.rework && (
                    <span className="sc-tag" data-tone="bad">
                      <RotateCcw size={9} /> redo
                    </span>
                  )}
                  {j.onTime === false && <span className="sc-tag" data-tone="bad">late</span>}
                  {j.onTime === true && <span className="sc-tag" data-tone="ok">on time</span>}
                  {j.inferred && (
                    <span className="sc-tag" data-tone="neutral" title="Closed by the file moving to Registration rather than by a Ready report">
                      inferred
                    </span>
                  )}
                </span>
                <span className="sc-job-time">{span(j.hours)}</span>
              </Link>
            ))
          )}
        </div>
      )}
    </section>
  );
}

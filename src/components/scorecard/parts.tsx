"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { duration } from "@/lib/format";
import type { MonthOption, MonthStat } from "@/lib/scorecard";

/**
 * Scorecard primitives.
 *
 * Shared by the engineer's own card and the Service Manager's team tab, so the two
 * surfaces report the same figure the same way. If the manager and the engineer
 * read a different-looking number for the same month, the number stops being
 * evidence and starts being an argument.
 */

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Hours at the precision a workshop talks in — "6h", "2d 4h".
 *
 * Never a bare decimal. "38.4" is a figure nobody can picture; "1d 14h" is a
 * span someone can compare to the week they actually had.
 */
export function span(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  // `duration` says "just now" below a minute, which is right for a moment in
  // time and wrong for a span. Same-minute jobs are rare but real — a file
  // assessed the instant its Credit Note cleared — and "just now" would read
  // as a timestamp rather than as a turnaround.
  if (hours * 60 < 1) return "<1m";
  return duration(hours * 3_600_000);
}

/** The same span, compact enough for an axis or a chip. */
export function spanShort(hours: number | null | undefined): string {
  if (hours === null || hours === undefined) return "—";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

// ---------------------------------------------------------------------------
// Month picker
// ---------------------------------------------------------------------------

/**
 * The month scrubber.
 *
 * A horizontal rail of months rather than a <select>, because the comparison
 * this view exists for is between adjacent months — and a dropdown hides
 * exactly that adjacency behind a tap. Arrows on either end make single-step
 * movement one tap on a phone; the rail itself makes a jump to March one tap
 * on a desk.
 */
export function MonthScrubber({
  months,
  value,
  onChange,
  busy = false,
}: {
  months: MonthOption[];
  value: string;
  onChange: (key: string) => void;
  busy?: boolean;
}) {
  const index = months.findIndex((m) => m.key === value);
  const current = months[index];
  const step = (by: number) => {
    const next = months[index + by];
    if (next) onChange(next.key);
  };

  return (
    <div className="sc-scrub" data-busy={busy}>
      <button
        type="button"
        className="sc-step"
        onClick={() => step(-1)}
        disabled={index <= 0}
        aria-label="Previous month"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="sc-rail no-scrollbar" role="group" aria-label="Month">
        {months.map((m) => {
          const on = m.key === value;
          return (
            <button
              key={m.key}
              type="button"
              className="sc-month"
              data-on={on}
              aria-pressed={on}
              onClick={() => onChange(m.key)}
              title={m.label}
            >
              <span className="sc-month-name">{m.short}</span>
              {/* The year only prints where it changes, so a rail that crosses
                  a December reads as a calendar rather than as noise. */}
              <span className="sc-month-year">
                {m.short === "Jan" || on ? `’${String(m.year).slice(2)}` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="sc-step"
        onClick={() => step(1)}
        disabled={index < 0 || index >= months.length - 1}
        aria-label="Next month"
      >
        <ChevronRight size={16} />
      </button>

      <span className="sc-scrub-now">{current?.label ?? value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

/**
 * Month-on-month movement, as a signed chip.
 *
 * `lowerIsBetter` flips the colour, not the sign: an average time that fell is
 * still shown falling, it is simply shown in green. Reversing the arrow as
 * well would be lying about the arithmetic to make a point about the meaning.
 */
export function Delta({
  from,
  to,
  lowerIsBetter = false,
  unit = "",
  hours = false,
}: {
  from: number | null | undefined;
  to: number | null | undefined;
  lowerIsBetter?: boolean;
  unit?: string;
  hours?: boolean;
}) {
  if (from === null || from === undefined || to === null || to === undefined) {
    return <span className="sc-delta" data-tone="flat">no prior month</span>;
  }
  const diff = to - from;
  if (Math.abs(diff) < (hours ? 0.5 : 0.01)) {
    return <span className="sc-delta" data-tone="flat">level</span>;
  }
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const mag = hours ? spanShort(Math.abs(diff)) : `${Math.abs(Math.round(diff * 10) / 10)}${unit}`;

  return (
    <span className="sc-delta" data-tone={better ? "up" : "down"}>
      {diff > 0 ? "▲" : "▼"} {mag}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The pace gauge
// ---------------------------------------------------------------------------

const START = 140;
const SWEEP = 260;

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/**
 * A pace gauge: average time to complete, drawn as an instrument.
 *
 * The workbench hero is already a torque gauge, so the surface that reports how
 * fast the bench is moving reads as the same instrument actually taking a
 * measurement. That is the whole reason it is a dial and not a fourth number in
 * a row: the number is the same either way, but a needle sitting left of the
 * team marker says "you are ahead of the shop" in one glance, and no arrangement
 * of digits does.
 *
 * Left is fast. The scale is built from the engineer's own history plus the
 * team mark, so it never rescales into meaninglessness on a quiet month, and
 * a needle that moved really did move.
 */
export function PaceGauge({
  hours,
  teamHours,
  bestHours,
  scaleMax,
  caption,
}: {
  hours: number | null;
  teamHours: number | null;
  bestHours: number | null;
  scaleMax: number;
  caption: string;
}) {
  const cx = 100;
  const cy = 96;
  const r = 68;

  const frac = (h: number) => Math.max(0, Math.min(1, h / scaleMax));
  const angle = (h: number) => START + frac(h) * SWEEP;

  // Faster than the shop is the good side; the gauge says so in colour rather
  // than making the reader compare two numbers themselves.
  const tone =
    hours === null || teamHours === null
      ? "var(--accent)"
      : hours <= teamHours
        ? "var(--ok)"
        : hours <= teamHours * 1.25
          ? "var(--warn)"
          : "var(--bad)";

  return (
    <div className="sc-gauge">
      <svg viewBox="0 0 200 132" className="w-full" role="img" aria-label={caption}>
        {/* Track */}
        <path
          d={arcPath(cx, cy, r, START, START + SWEEP)}
          stroke="var(--rule)"
          strokeWidth="11"
          strokeLinecap="round"
          fill="none"
        />

        {/* Ticks — every fifth of the scale, so the arc reads as measured. */}
        <g stroke="var(--ink-3)" strokeOpacity="0.4" strokeWidth="1.6" strokeLinecap="round">
          {Array.from({ length: 6 }).map((_, i) => {
            const a = START + (i / 5) * SWEEP;
            const [ax, ay] = polar(cx, cy, r - 10, a);
            const [bx, by] = polar(cx, cy, r - 16, a);
            return <path key={i} d={`M${ax} ${ay}L${bx} ${by}`} />;
          })}
        </g>

        {/* Swept portion, up to the reading. */}
        {hours !== null && (
          <path
            d={arcPath(cx, cy, r, START, Math.max(START + 0.5, angle(hours)))}
            stroke={tone}
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
            style={{ transition: "d 0.4s var(--ease-out-quart)" }}
          />
        )}

        {/* The shop's mark. A single notch, not a second needle — this is
            context for the reading, not a competing reading. */}
        {teamHours !== null && (
          <g>
            <path
              d={(() => {
                const a = angle(teamHours);
                const [ax, ay] = polar(cx, cy, r + 9, a);
                const [bx, by] = polar(cx, cy, r - 9, a);
                return `M${ax} ${ay}L${bx} ${by}`;
              })()}
              stroke="var(--ink-2)"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <text
              {...(() => {
                const [tx, ty] = polar(cx, cy, r + 19, angle(teamHours));
                return { x: tx, y: ty };
              })()}
              textAnchor="middle"
              dominantBaseline="middle"
              className="sc-gauge-mark"
            >
              shop
            </text>
          </g>
        )}

        {/* Personal best, as a hollow pip. */}
        {bestHours !== null && (
          <circle
            {...(() => {
              const [px, py] = polar(cx, cy, r, angle(bestHours));
              return { cx: px, cy: py };
            })()}
            r="3.4"
            fill="var(--surface)"
            stroke="var(--ok)"
            strokeWidth="2"
          />
        )}

        {/* Needle + hub */}
        {hours !== null && (
          <g>
            <path
              d={(() => {
                const [nx, ny] = polar(cx, cy, r - 20, angle(hours));
                return `M${cx} ${cy}L${nx.toFixed(2)} ${ny.toFixed(2)}`;
              })()}
              stroke={tone}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r="6" fill={tone} />
            <circle cx={cx} cy={cy} r="2.4" fill="var(--surface)" />
          </g>
        )}

        {/* Reading */}
        <text x={cx} y={cy - 26} textAnchor="middle" className="sc-gauge-value">
          {hours === null ? "—" : span(hours)}
        </text>
        <text x={cx} y={cy - 10} textAnchor="middle" className="sc-gauge-unit">
          avg to complete
        </text>

        {/* Scale ends, so nobody has to guess which way is good. */}
        <text x="20" y="124" textAnchor="middle" className="sc-gauge-end">faster</text>
        <text x="180" y="124" textAnchor="middle" className="sc-gauge-end">slower</text>
      </svg>
      <p className="sc-gauge-caption">{caption}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The trend
// ---------------------------------------------------------------------------

/**
 * Twelve months, two measures, one tap target per month.
 *
 * Volume above, pace below, sharing an axis. They are drawn as two facing
 * ridges rather than a column chart with an overlaid line: an overlay implies
 * the two share a scale, and "nine jobs" and "two days" do not. Facing them
 * across a common baseline keeps the comparison the eye actually wants — did
 * the busy months also get slower — without asserting a false one.
 *
 * The pace ridge points DOWN, so on both ridges a bigger shape is a worse
 * month for pace and a better month for volume only where it grows upward.
 * Every column is a button: the trend is also the navigation.
 */
export function TrendRidge({
  points,
  selected,
  onSelect,
}: {
  points: { key: string; short: string; completed: number; avgHours: number | null }[];
  selected: string;
  onSelect: (key: string) => void;
}) {
  const peakVolume = Math.max(1, ...points.map((p) => p.completed));
  const peakHours = Math.max(
    1,
    ...points.map((p) => p.avgHours ?? 0),
  );

  return (
    <div className="sc-ridge">
      {points.map((p) => {
        const on = p.key === selected;
        return (
          <button
            key={p.key}
            type="button"
            className="sc-ridge-col"
            data-on={on}
            aria-pressed={on}
            onClick={() => onSelect(p.key)}
            title={`${p.short}: ${p.completed} completed${p.avgHours !== null ? `, ${span(p.avgHours)} average` : ""}`}
          >
            <span className="sc-ridge-num">{p.completed || ""}</span>
            <span className="sc-ridge-up">
              <span
                className="sc-ridge-fill"
                data-empty={p.completed === 0}
                style={{ height: p.completed === 0 ? 2 : Math.max(4, (p.completed / peakVolume) * 46) }}
              />
            </span>
            <span className="sc-ridge-axis">{p.short}</span>
            <span className="sc-ridge-down">
              <span
                className="sc-ridge-pace"
                data-empty={p.avgHours === null}
                style={{
                  height:
                    p.avgHours === null ? 2 : Math.max(3, (p.avgHours / peakHours) * 26),
                }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Flow
// ---------------------------------------------------------------------------

/**
 * In versus out for one month, as one bar.
 *
 * Two counts side by side ("14 assigned, 11 completed") make the reader do the
 * subtraction. One bar does it for them, and makes the case where MORE was
 * completed than arrived — clearing a backlog, the best kind of month — visible
 * as an overhang rather than as an arithmetic surprise.
 */
export function FlowBar({ stat }: { stat: MonthStat }) {
  const peak = Math.max(1, stat.assigned, stat.completed);
  const clearing = stat.completed > stat.assigned;

  return (
    <div className="sc-flow">
      <FlowRow
        label="Assigned"
        value={stat.assigned}
        pct={(stat.assigned / peak) * 100}
        tone="var(--cat-assess)"
      />
      <FlowRow
        label="Completed"
        value={stat.completed}
        pct={(stat.completed / peak) * 100}
        tone={clearing ? "var(--ok)" : "var(--cat-repair)"}
      />
      <p className="sc-flow-note">
        {stat.assigned === 0 && stat.completed === 0
          ? "Nothing landed and nothing closed this month."
          : clearing
            ? `Cleared ${stat.completed - stat.assigned} more than arrived — backlog came down.`
            : stat.completed === stat.assigned
              ? "Everything that arrived was matched by something closed."
              : `${stat.assigned - stat.completed} more arrived than closed; ${stat.carried} still open at month end.`}
      </p>
    </div>
  );
}

function FlowRow({
  label,
  value,
  pct,
  tone,
}: {
  label: string;
  value: number;
  pct: number;
  tone: string;
}) {
  return (
    <div className="sc-flow-row">
      <span className="sc-flow-label">{label}</span>
      <span className="sc-flow-track">
        <span className="sc-flow-fill" style={{ width: `${Math.max(2, pct)}%`, background: tone }} />
      </span>
      <span className="sc-flow-value">{value}</span>
    </div>
  );
}

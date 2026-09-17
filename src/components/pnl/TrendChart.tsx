"use client";

import { useMemo, useState } from "react";
import { millions } from "@/lib/format";
import type { Bucket, TerritorySeries } from "@/lib/resalePnl";

/**
 * How each territory has moved, month by month.
 *
 * The column chart above answers "how did the book do"; this answers "who
 * changed". They are different questions and want different marks: a total
 * belongs in a bar, a trajectory belongs in a line, and a trajectory in bars
 * makes the reader do the joining-up themselves.
 *
 * On colour, and why there is almost none: six territories is past the point
 * where a categorical palette can be told apart honestly — six hues cannot
 * hold a 3:1 separation from each other under normal vision, let alone under
 * deuteranopia, and a legend the reader has to keep re-checking is a legend
 * that has failed. So every line is drawn in the same muted ink and ONE is
 * lifted at a time. Emphasis carries the identity, not hue; the highlighted
 * line is also thicker and brought to the front, so it survives a greyscale
 * print and a colour-blind reader equally.
 *
 * The metric switch matters more than it looks. "Sales" and "Profit" are money
 * and share an axis happily; "Profit rate" and "Against asking" are ratios and
 * deviations that would be meaningless on a money axis. Switching the metric
 * rebuilds the scale rather than trying to host all four at once, which is the
 * honest alternative to a second y-axis.
 */

type Metric = "soldValue" | "margin" | "marginPct" | "realisation";

const METRICS: { key: Metric; label: string; hint: string; money: boolean }[] = [
  { key: "soldValue", label: "Sales", hint: "What buyers paid each month", money: true },
  { key: "margin", label: "Profit", hint: "Sales less costs, each month", money: true },
  {
    key: "marginPct",
    label: "Profit rate",
    hint: "Profit as a share of that month's sales",
    money: false,
  },
  {
    key: "realisation",
    label: "Against asking",
    hint: "Closed above (+) or below (−) the approved price",
    money: true,
  },
];

const W = 760; // viewBox width — the drawing is scaled by CSS, not by pixels
const H = 190;
const PAD = { top: 12, right: 12, bottom: 26, left: 52 };

/** A round number at or above `n`, so the axis ends somewhere sayable. */
function nice(n: number): number {
  if (n <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = [1, 1.5, 2, 2.5, 5, 10].find((s) => s * mag >= n) ?? 10;
  return step * mag;
}

function valueOf(b: Bucket, m: Metric): number | null {
  const v = b[m];
  return v === null || v === undefined ? null : (v as number);
}

export function TrendChart({
  series,
  months,
}: {
  series: TerritorySeries[];
  /** The month axis every series shares. */
  months: string[];
}) {
  const [metric, setMetric] = useState<Metric>("margin");
  const [hot, setHot] = useState<string | null>(null);

  const spec = METRICS.find((m) => m.key === metric)!;

  const { lo, hi, ticks } = useMemo(() => {
    const all: number[] = [];
    for (const s of series) {
      for (const p of s.points) {
        const v = valueOf(p, metric);
        if (v !== null) all.push(v);
      }
    }
    if (all.length === 0) return { lo: 0, hi: 1, ticks: [0, 1] };

    const rawMax = Math.max(...all, 0);
    const rawMin = Math.min(...all, 0);
    // A metric that goes negative gets a symmetric-ish frame so the zero rule
    // sits somewhere honest rather than being pinned to the floor.
    const hi = nice(rawMax);
    const lo = rawMin < 0 ? -nice(Math.abs(rawMin)) : 0;
    const span = hi - lo || 1;
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * span);
    return { lo, hi, ticks };
  }, [series, metric]);

  if (series.length === 0 || months.length === 0) {
    return <p className="py-10 text-center text-[13px] text-ink-3">Nothing sold in this range.</p>;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const span = hi - lo || 1;

  // One x per month. A single-month window would divide by zero, so it is
  // pinned to the middle instead of the left edge.
  const x = (i: number) =>
    PAD.left + (months.length === 1 ? plotW / 2 : (i / (months.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - ((v - lo) / span) * plotH;

  const zeroY = lo < 0 ? y(0) : null;
  const active = hot;

  const fmt = (v: number | null) =>
    v === null ? "—" : spec.money ? millions(v) : `${v.toFixed(1)}%`;

  return (
    <div className="tr">
      {/* ---- What is being plotted ---- */}
      <div className="tr-head">
        <div className="tr-metrics" role="group" aria-label="Metric">
          {METRICS.map((m) => (
            <button
              key={m.key}
              className="tr-metric"
              data-on={metric === m.key || undefined}
              aria-pressed={metric === m.key}
              title={m.hint}
              onClick={() => setMetric(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <span className="tr-unit">{spec.money ? "millions" : "per cent"}</span>
      </div>

      <div className="tr-plot">
        <svg viewBox={`0 0 ${W} ${H}`} className="tr-svg" role="img" aria-label={`${spec.label} by territory, month by month`}>
          {/* Grid. Hairline solid rules, never dashed. */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="tr-rule" />
              <text x={PAD.left - 7} y={y(t) + 3} className="tr-ytick">
                {fmt(t)}
              </text>
            </g>
          ))}

          {/* The zero rule, when the metric crosses it — heavier than the grid,
              because "did this go negative" is a different question from "how
              big is it". */}
          {zeroY !== null && (
            <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} className="tr-zero" />
          )}

          {/* The lines. Unhighlighted first so the active one lands on top. */}
          {[...series]
            .sort((a, b) => (a.territory === active ? 1 : b.territory === active ? -1 : 0))
            .map((s) => {
              const on = active === s.territory;
              const pts = s.points
                .map((p, i) => {
                  const v = valueOf(p, metric);
                  return v === null ? null : `${x(i)},${y(v)}`;
                })
                .filter((q): q is string => q !== null);
              if (pts.length === 0) return null;
              return (
                <g key={s.territory}>
                  <polyline
                    points={pts.join(" ")}
                    className="tr-line"
                    data-on={on || undefined}
                    data-dim={active !== null && !on ? true : undefined}
                  />
                  {/* Dots only on the line being read — six territories of dots
                      at once is a texture, not information. */}
                  {on &&
                    s.points.map((p, i) => {
                      const v = valueOf(p, metric);
                      return v === null ? null : (
                        <circle key={p.key} cx={x(i)} cy={y(v)} r={2.6} className="tr-dot" />
                      );
                    })}
                </g>
              );
            })}

          {/* X labels. Thinned on long windows so they never collide. */}
          {months.map((m, i) => {
            const every = months.length > 14 ? 3 : months.length > 8 ? 2 : 1;
            if (i % every !== 0 && i !== months.length - 1) return null;
            return (
              <text key={m} x={x(i)} y={H - 8} className="tr-xtick">
                {m.slice(5)}/{m.slice(2, 4)}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ---- The legend IS the control. Hovering a name lifts its line; the
              figure beside it is that territory's total for the window, so the
              legend ranks as well as identifies. ---- */}
      <div className="tr-legend" onMouseLeave={() => setHot(null)}>
        {series.map((s) => {
          const v = valueOf(s.total, metric);
          const on = active === s.territory;
          return (
            <button
              key={s.territory}
              className="tr-key"
              data-on={on || undefined}
              onMouseEnter={() => setHot(s.territory)}
              onFocus={() => setHot(s.territory)}
              onClick={() => setHot((h) => (h === s.territory ? null : s.territory))}
              aria-pressed={on}
            >
              <span className="tr-key-name">{s.territory}</span>
              <span
                className="tr-key-val"
                style={
                  v !== null && v < 0 && metric === "realisation"
                    ? { color: "var(--bad)" }
                    : undefined
                }
              >
                {fmt(v)}
              </span>
            </button>
          );
        })}
      </div>

      <p className="tr-foot">
        {active ? (
          <>
            Showing <strong>{active}</strong> against the rest. Click it again, or move away, to
            release.
          </>
        ) : (
          <>Hover or click a territory to follow its line. {spec.hint}.</>
        )}
      </p>
    </div>
  );
}

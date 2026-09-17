"use client";

import { useState } from "react";
import { millions } from "@/lib/format";
import type { Bucket } from "@/lib/resalePnl";

/**
 * The month panel: two plots, one x-axis, one hover.
 *
 * The top plot answers "how much moved" — sold value against the cost that
 * earned it. The strip beneath answers "did we get the price we asked for",
 * as a deviation above or below zero.
 *
 * They are ONE card sharing ONE x-axis rather than two cards, because the
 * question a reader actually has is "was the big month also a good month",
 * and that is a comparison you can only make when the two plots line up
 * column for column. Hovering any month lights it in both.
 *
 * Two plots rather than one for a reason that is not aesthetic: value is in
 * taka and realisation is a deviation that goes negative. Putting them on one
 * frame would need two y-scales, and the alignment between two y-scales is
 * arbitrary — it invents a correlation the data does not contain. Small
 * multiples on a shared x is the honest version of that chart.
 *
 * Colour: sold value takes the product accent; cost takes an amber that clears
 * CVD separation against it by a wide margin (ΔE 28.8 protan / 27.4 tritan,
 * validated, not eyeballed). The gain/loss strip uses the semantic green and
 * red — a pair that is genuinely weak under deuteranopia (ΔE 6.6) and is only
 * legal here because position carries the same information: above the zero
 * rule is gain, below it is loss, and the label is signed. Nobody has to see
 * the hue to read it.
 */

const H_VALUE = 168; // top plot, px
const H_DELTA = 64; // gain/loss strip, px

/** A round number at or above `n`, for the axis top. */
function niceMax(n: number): number {
  if (n <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(n));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * mag >= n) ?? 10;
  return step * mag;
}

export function MonthChart({
  buckets,
  onPick,
  picked,
}: {
  buckets: Bucket[];
  /** Clicking a column filters the page to that month. */
  onPick?: (key: string) => void;
  picked?: string | null;
}) {
  const [hot, setHot] = useState<string | null>(null);

  if (buckets.length === 0) {
    return <p className="py-10 text-center text-[13px] text-ink-3">Nothing sold in this range.</p>;
  }

  const top = niceMax(Math.max(...buckets.map((b) => Math.max(b.soldValue, b.cost)), 1));
  // The strip is scaled on the largest swing in EITHER direction, so a gain and
  // a loss of the same size draw the same length. Scaling each side to its own
  // extreme would make a small loss look like a catastrophe next to a big gain.
  const swing = Math.max(...buckets.map((b) => Math.abs(b.realisation ?? 0)), 1);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);
  const active = hot ?? picked ?? null;
  const shown = buckets.find((b) => b.key === active) ?? null;

  return (
    <div className="mc" onMouseLeave={() => setHot(null)}>
      {/* ---- Legend. Always present: two series must never be told apart by
              colour alone. ---- */}
      <div className="mc-legend">
        <span className="mc-key">
          <i className="mc-swatch" style={{ background: "var(--chart-value)" }} />
          Profit
        </span>
        <span className="mc-key">
          <i className="mc-swatch" style={{ background: "var(--chart-cost)" }} />
          Cost
        </span>
        <span className="mc-key mc-key-note">together = sales</span>
        <span className="mc-key mc-key-sep">
          <i className="mc-swatch" style={{ background: "var(--ok)" }} />
          Above asking price
        </span>
        <span className="mc-key">
          <i className="mc-swatch" style={{ background: "var(--bad)" }} />
          Below asking price
        </span>
      </div>

      <div className="mc-body">
        {/* ---- Y axis. Hairline solid rules, never dashed. ---- */}
        <div className="mc-axis" style={{ height: H_VALUE }} aria-hidden>
          {[...ticks].reverse().map((t) => (
            <span key={t} className="mc-tick">
              {t === 0 ? "0" : millions(t)}
            </span>
          ))}
        </div>

        <div className="mc-plots">
          <div className="mc-grid" style={{ height: H_VALUE }} aria-hidden>
            {ticks.map((t) => (
              <span key={t} className="mc-rule" />
            ))}
          </div>

          {/* ---- The columns. One hover target per month, spanning both
                  plots and the label, so a thin bar is still easy to hit. ---- */}
          <div className="mc-cols">
            {buckets.map((b) => {
              const on = active === b.key;
              const gain = b.realisation ?? 0;
              return (
                <div
                  key={b.key}
                  className="mc-col"
                  data-on={on || undefined}
                  data-picked={picked === b.key || undefined}
                  onMouseEnter={() => setHot(b.key)}
                  onFocus={() => setHot(b.key)}
                  onClick={onPick ? () => onPick(b.key) : undefined}
                  tabIndex={onPick ? 0 : -1}
                  onKeyDown={(e) => {
                    if (onPick && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onPick(b.key);
                    }
                  }}
                  role={onPick ? "button" : undefined}
                  aria-label={`${b.label}: ${b.units} sold, ${millions(b.soldValue)}, ${
                    gain >= 0 ? "above" : "below"
                  } asking by ${millions(Math.abs(gain))}`}
                >
                  {/* Top plot: one stacked column, cost at the base and
                      contribution above it, so the whole column IS the sold
                      value and the two parts are read as a proportion of it.

                      Stacked rather than side by side because cost runs around
                      a tenth of the sale here: as a paired column it was a
                      sliver next to a full-height bar, and nine tenths of the
                      plot said nothing. Stacked, the same figure is a visible
                      band at the foot of every column and its share is legible
                      at a glance.

                      A loss inverts the reading: the column becomes the sold
                      value with the overrun capped in red ABOVE it — cost
                      overshooting what the sale brought in. */}
                  <div className="mc-stack" style={{ height: H_VALUE }}>
                    {b.margin >= 0 ? (
                      <>
                        <span
                          className="mc-seg mc-seg-top"
                          style={{
                            height: `${(b.margin / top) * 100}%`,
                            background: "var(--chart-value)",
                          }}
                        />
                        <span
                          className="mc-seg"
                          style={{
                            height: `${(b.cost / top) * 100}%`,
                            background: "var(--chart-cost)",
                          }}
                        />
                      </>
                    ) : (
                      <>
                        <span
                          className="mc-seg mc-seg-top"
                          style={{
                            height: `${(Math.abs(b.margin) / top) * 100}%`,
                            background: "var(--bad)",
                          }}
                        />
                        <span
                          className="mc-seg"
                          style={{
                            height: `${(b.soldValue / top) * 100}%`,
                            background: "var(--chart-cost)",
                          }}
                        />
                      </>
                    )}
                  </div>

                  {/* Strip: deviation from the asking price, drawn from a
                      centre rule so the sign is a direction, not just a hue. */}
                  <div className="mc-delta" style={{ height: H_DELTA }}>
                    <span className="mc-zero" />
                    <span
                      className="mc-dbar"
                      data-dir={gain >= 0 ? "up" : "down"}
                      style={{
                        height: `${(Math.abs(gain) / swing) * 46}%`,
                        background: gain >= 0 ? "var(--ok)" : "var(--bad)",
                      }}
                    />
                  </div>

                  <span className="mc-xlabel">{b.label.split(" ")[0]}</span>
                  <span className="mc-xyear">{b.label.split(" ")[1]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---- Read-out. A fixed slot rather than a floating tooltip: the panel
              never reflows on hover, and with nothing hovered it shows the
              latest month, so the card is informative at rest. ---- */}
      <Readout bucket={shown ?? buckets[buckets.length - 1]} live={!!shown} />
    </div>
  );
}

function Readout({ bucket, live }: { bucket: Bucket; live: boolean }) {
  const gain = bucket.realisation;
  return (
    <div className="mc-readout" aria-live="polite">
      <span className="mc-ro-month">
        {bucket.label}
        {!live && <em className="mc-ro-hint">latest — hover any month</em>}
      </span>
      <span className="mc-ro-figs">
        <Fig label="Sold" value={String(bucket.units)} />
        <Fig label="Sales" value={millions(bucket.soldValue)} />
        <Fig label="Costs" value={millions(bucket.cost)} />
        <Fig label="SOP" value={millions(bucket.sop)} />
        <Fig label="Profit" value={millions(bucket.margin)} />
        <Fig
          label="vs asking price"
          value={gain === null ? "—" : `${gain >= 0 ? "+" : "−"}${millions(Math.abs(gain))}`}
          tone={gain === null ? undefined : gain >= 0 ? "ok" : "bad"}
        />
      </span>
    </div>
  );
}

function Fig({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <span className="mc-fig">
      <span className="mc-fig-label">{label}</span>
      {/* The figure wears an ink token unless it is a gain or a loss, where the
          colour is the meaning rather than decoration. */}
      <span
        className="mc-fig-value"
        style={tone ? { color: tone === "ok" ? "var(--ok)" : "var(--bad)" } : undefined}
      >
        {value}
      </span>
    </span>
  );
}

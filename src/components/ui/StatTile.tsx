"use client";

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { CountUp } from "@/components/ui/CountUp";

/**
 * Tinted stat tile — the summary metric used across the field and desk panels.
 *
 * Tints are semantic, not decorative: a tile is coloured because of what its
 * figure means, never to make a row of tiles look varied. The values live in
 * CSS tokens (see the STAT TILE TINTS block in globals.css) so the palette is
 * defined in one place and callers only name the meaning.
 *
 * Two grounds, one component. The default is a flat surface with the tint
 * carried by the glyph — right for a desk portal, where a row of tiles sits
 * above a dense table and must not compete with it. `aura` fills the tile with
 * a soft wash in its own tint, which is right for a field panel where three
 * tiles ARE the top of the page and there is nothing below them to lose to.
 *
 * Neither ground uses a coloured left border. That marker used to live on the
 * tiles, the insight readings, the repair lines and the resale rows — four
 * unrelated surfaces sharing one edge treatment, at which point it had stopped
 * being a signal and become wallpaper.
 */
export type Tint = "accent" | "info" | "ok" | "warn" | "bad" | "neutral";

export function StatTile({
  icon,
  label,
  value,
  caption,
  tint,
  trendPct,
  /** Pre-formatted value — use when the figure is money or a percentage. */
  display,
  /** Turns the tile into a filter control. */
  onClick,
  active = false,
  /** `aura` fills the tile with a soft gradient wash in its tint; `solid` does
   *  the same in one flat colour. Desk portals keep the plain `flat` ground. */
  ground = "flat",
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  caption: string;
  tint: Tint;
  trendPct?: number | null;
  display?: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  ground?: "flat" | "aura" | "solid";
}) {
  // The ink drives the glyph on both grounds; the from/to pair is only read by
  // the aura wash, and costs nothing when the flat ground ignores it.
  const style = {
    ["--tint-accent" as string]: `var(--tint-${tint}-ink)`,
    ["--tint-from" as string]: `var(--tint-${tint}-from)`,
    ["--tint-to" as string]: `var(--tint-${tint}-to)`,
  } as React.CSSProperties;

  const aura = ground === "aura";
  // Passed through as its own attribute so `solid` and `aura` cannot both
  // match — they are two different materials, not two settings of one.
  const groundAttr = ground === "flat" ? undefined : ground;

  const TrendIcon =
    trendPct == null ? null : trendPct > 0 ? ArrowUpRight : trendPct < 0 ? ArrowDownRight : Minus;
  const trendColor =
    trendPct == null || trendPct === 0
      ? "var(--ink-3)"
      : trendPct > 0
        ? "var(--ok)"
        : "var(--bad)";

  const body = (
    <>
      <span className="stat-glyph">{icon}</span>

      {/* Label first: it says what is being counted, and reading the figure
          before knowing that means reading it twice. The glyph is absolutely
          positioned, so the label can run the full width under it. */}
      <div className="pr-6 font-mono text-[length:var(--t-micro)] uppercase tracking-[var(--track-label)] text-ink-3">
        {label}
      </div>

      <div
        className="mt-1 font-display text-[length:var(--t-xl)] font-bold leading-none tnum text-ink"
        style={{ letterSpacing: "var(--track-display)" }}
      >
        {display ?? <CountUp value={value} />}
      </div>

      <div className="mt-1 flex items-center gap-1">
        {TrendIcon && (
          <span className="trend-badge" style={{ color: trendColor }}>
            <TrendIcon size={10} />
            {Math.abs(trendPct!)}%
          </span>
        )}
        <span className="truncate font-mono text-[length:var(--t-micro)] leading-tight text-ink-3">{caption}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="stat-tile text-left"
        style={style}
        data-tint={tint}
        data-aura={aura}
        data-ground={groundAttr}
        data-picked={active}
        onClick={onClick}
        aria-pressed={active}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="stat-tile" style={style} data-tint={tint} data-aura={aura} data-ground={groundAttr}>
      {body}
    </div>
  );
}

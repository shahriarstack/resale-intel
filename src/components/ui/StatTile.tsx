"use client";

import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { CountUp } from "@/components/ui/CountUp";

/**
 * Tinted stat tile — the summary metric used across the field and desk panels.
 *
 * Tints are semantic, not decorative: a tile is coloured because of what its
 * figure means, never to make a row of tiles look varied. The values live in
 * CSS tokens (see the STAT TILE TINTS block in globals.css) so light and dark
 * are defined in one place and callers only name the meaning.
 */
export type Tint = "accent" | "info" | "warn" | "bad" | "neutral";

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
}) {
  const style = {
    ["--tint-from" as string]: `var(--tint-${tint}-from)`,
    ["--tint-to" as string]: `var(--tint-${tint}-to)`,
    ["--tint-accent" as string]: `var(--tint-${tint}-ink)`,
  } as React.CSSProperties;

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
      <div className="pr-6 font-mono text-[9px] uppercase tracking-[0.13em] text-ink-3">
        {label}
      </div>

      <div
        className="mt-1.5 font-display text-[23px] font-bold leading-none tnum text-ink"
        style={{ letterSpacing: "-0.032em" }}
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
        <span className="truncate font-mono text-[9px] leading-tight text-ink-3">{caption}</span>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className="stat-tile text-left aura-glass transition-transform hover:scale-[1.02]"
        style={style}
        data-picked={active}
        onClick={onClick}
        aria-pressed={active}
      >
        {body}
      </button>
    );
  }

  return (
    <div className="stat-tile aura-glass transition-transform hover:scale-[1.02]" style={style}>
      {body}
    </div>
  );
}

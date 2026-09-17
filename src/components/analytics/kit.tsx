import type { Tone } from "@/lib/status";
import type { Leader, Reading, Segment, Slice } from "@/lib/insights";
import { takaCompact } from "@/lib/format";

/**
 * The insight kit.
 *
 * Seven primitives that every desk's analytics block is assembled from. They
 * are deliberately plain server components: the numbers are computed on the
 * server and never change without a navigation, so shipping a client bundle to
 * animate them would be paying for nothing.
 *
 * Colour is always passed as a `Tone` and applied via `data-tone`, which sets
 * the --tone-* custom properties (see INSIGHT SURFACES in globals.css). No
 * primitive here names a colour, so re-theming happens in one place.
 */

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

/**
 * The block wrapper. Sits under a desk queue and is titled, not headed — an
 * <h2> here would compete with the queue it is describing.
 */
export function InsightBlock({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5" aria-label={title}>
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">{title}</h2>
        {meta && <span className="font-mono text-[10px] text-ink-3">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * A compact panel. `span` is in 12-column units at the lg breakpoint; below
 * that everything stacks, because a two-column analytics grid on a phone is
 * two unreadable columns rather than one readable one.
 */
export function Panel({
  title,
  icon,
  meta,
  tone = "accent",
  span = 4,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  meta?: string;
  tone?: Tone;
  span?: 3 | 4 | 5 | 6 | 7 | 8 | 12;
  children: React.ReactNode;
}) {
  return (
    <div className={`insight-panel ${SPAN[span]}`} data-tone={tone}>
      <div className="flex items-center justify-between gap-2">
        <div className="insight-head">
          {icon}
          <span className="truncate">{title}</span>
        </div>
        {meta && (
          <span className="shrink-0 font-mono text-[9px] tabular-nums text-ink-3">{meta}</span>
        )}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

// Static class strings — Tailwind cannot see a template-built class name, so
// the spans have to be spelled out for the JIT to emit them.
const SPAN: Record<number, string> = {
  3: "lg:col-span-3",
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
  8: "lg:col-span-8",
  12: "lg:col-span-12",
};

/** The 12-column grid the panels sit in. */
export function PanelGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-12">{children}</div>;
}

// ---------------------------------------------------------------------------
// Readings
// ---------------------------------------------------------------------------

/**
 * The four headline figures for a desk, as one instrument strip.
 *
 * A null value renders "No data yet" rather than a zero. The distinction
 * matters: "0% approved" and "nothing has been decided yet" are different
 * facts, and a dashboard that conflates them teaches people to distrust it.
 */
export function ReadingStrip({ readings }: { readings: Reading[] }) {
  return (
    <div className="insight-panel lg:col-span-12" data-tone="accent">
      <div className="grid grid-cols-2 gap-x-5 gap-y-4 lg:grid-cols-4">
        {readings.map((r) => (
          <div key={r.label} className="reading" data-tone={r.tone}>
            <div className="reading-label">{r.label}</div>
            {r.value === null ? (
              <div className="reading-empty">No data yet</div>
            ) : (
              <div className="reading-value">
                {formatValue(r.value)}
                {r.unit && <span className="reading-unit">{r.unit}</span>}
              </div>
            )}
            <div className="reading-caption">{r.caption}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatValue(n: number): string {
  // Whole numbers stay whole; a rate like 62.5 keeps its decimal. Grouping
  // only kicks in above a thousand, where it actually helps.
  return Number.isInteger(n) ? n.toLocaleString("en-GB") : n.toFixed(1);
}

// ---------------------------------------------------------------------------
// Distribution
// ---------------------------------------------------------------------------

/**
 * A ranked list of slices with a proportional bar under each row.
 *
 * Bars are scaled against the largest slice rather than the total, so a set
 * where one value dominates still shows the shape of the tail. The count is
 * always printed, so the bar is an aid to reading rather than the only source
 * of the number.
 */
export function BarList({
  slices,
  emptyLabel,
  max = 6,
}: {
  slices: Slice[];
  emptyLabel: string;
  max?: number;
}) {
  if (slices.length === 0) return <p className="insight-empty">{emptyLabel}</p>;

  const shown = slices.slice(0, max);
  const peak = Math.max(1, ...shown.map((s) => s.count));

  return (
    <ul className="space-y-0.5">
      {shown.map((s) => (
        <li key={s.key} className="bar-row" data-tone={s.tone} data-meta={s.meta ? "" : undefined}>
          <span className="bar-label">
            <span className="bar-dot" aria-hidden />
            <span className="truncate">{s.label}</span>
          </span>
          {/* The secondary readout gets its own cell rather than trailing the
              count. Sat next to it, "3" and "2d" read as "32d" — the one thing
              a dense numeric row must never do. */}
          {s.meta && <span className="bar-meta">{s.meta}</span>}
          <span className="bar-value">{s.count.toLocaleString("en-GB")}</span>
          <span className="bar-track">
            <span className="bar-fill block" style={{ width: `${(s.count / peak) * 100}%` }} />
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A single bar split into its components, with an inline legend beneath.
 *
 * Used for money composition. Segments below 2% of the total are still listed
 * in the legend but given a floor width in the bar, because a 0.4px sliver is
 * indistinguishable from a rendering artefact.
 */
export function StackBar({
  segments,
  total,
  emptyLabel,
  money = true,
}: {
  segments: Segment[];
  total: number;
  emptyLabel: string;
  money?: boolean;
}) {
  if (total <= 0 || segments.length === 0) {
    return <p className="insight-empty">{emptyLabel}</p>;
  }

  return (
    <>
      <div className="stack-bar" role="img" aria-label={`Cost split across ${segments.length} components`}>
        {segments.map((s) => (
          <span
            key={s.key}
            className="stack-seg"
            data-tone={s.tone}
            style={{ width: `${Math.max(2, (s.value / total) * 100)}%` }}
            title={`${s.label}: ${money ? takaCompact(s.value) : s.value}`}
          />
        ))}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5" data-tone={s.tone}>
            <span className="bar-dot" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[11px] text-ink-2">{s.label}</span>
            <span className="font-mono text-[10.5px] font-semibold tabular-nums text-ink">
              {money ? takaCompact(s.value) : s.value.toLocaleString("en-GB")}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-rule/70 pt-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3">Total</span>
        <span className="font-display text-[15px] font-bold tabular-nums text-ink">
          {money ? takaCompact(total) : total.toLocaleString("en-GB")}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

/** A short leaderboard. Rank, name, staff ID, one number. */
export function Ranked({
  leaders,
  emptyLabel,
  tone = "accent",
}: {
  leaders: Leader[];
  emptyLabel: string;
  tone?: Tone;
}) {
  if (leaders.length === 0) return <p className="insight-empty">{emptyLabel}</p>;

  return (
    <ol className="space-y-1.5">
      {leaders.map((l, i) => (
        <li key={l.id} className="flex items-center gap-2" data-tone={i === 0 ? tone : "neutral"}>
          <span className="rank-pill">{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] font-medium leading-tight text-ink">
              {l.name}
            </span>
            {l.staffId && (
              <span className="block truncate font-mono text-[9px] leading-tight text-ink-3">
                {l.staffId}
              </span>
            )}
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-mono text-[12px] font-bold tabular-nums leading-tight text-ink">
              {l.value.toLocaleString("en-GB")}
            </span>
            <span className="block font-mono text-[8.5px] uppercase tracking-wider leading-tight text-ink-3">
              {l.meta}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// Rates
// ---------------------------------------------------------------------------

/**
 * A split rate — two counts shown as one bar plus both figures.
 *
 * Preferred over a donut for a binary: a two-slice pie is a bar drawn the hard
 * way, and it costs vertical space this layout does not have.
 */
export function SplitRate({
  left,
  right,
  leftLabel,
  rightLabel,
  leftTone = "ok",
  rightTone = "bad",
}: {
  left: number;
  right: number;
  leftLabel: string;
  rightLabel: string;
  leftTone?: Tone;
  rightTone?: Tone;
}) {
  const total = left + right;
  if (total === 0) {
    return <p className="insight-empty">Nothing recorded in this window yet.</p>;
  }
  const leftPct = Math.round((left / total) * 100);

  return (
    <>
      <div className="flex items-end justify-between gap-3">
        <div data-tone={leftTone}>
          <div className="font-display text-[21px] font-bold leading-none tabular-nums text-ink">
            {leftPct}
            <span className="reading-unit">%</span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] text-ink-3">
            {leftLabel} · {left}
          </div>
        </div>
        <div className="text-right" data-tone={rightTone}>
          <div className="font-display text-[15px] font-bold leading-none tabular-nums text-ink-2">
            {100 - leftPct}
            <span className="reading-unit">%</span>
          </div>
          <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.11em] text-ink-3">
            {rightLabel} · {right}
          </div>
        </div>
      </div>
      <div className="stack-bar mt-2.5">
        <span className="stack-seg" data-tone={leftTone} style={{ width: `${leftPct}%` }} />
        <span className="stack-seg" data-tone={rightTone} style={{ width: `${100 - leftPct}%` }} />
      </div>
    </>
  );
}

/**
 * A labelled column plot for a small ordered series.
 *
 * Bars carry a floor height so an empty period reads as "measured, nothing
 * happened" rather than as a gap in the axis.
 */
export function Columns({
  points,
  tone = "accent",
  emptyLabel,
}: {
  points: { label: string; value: number }[];
  tone?: Tone;
  emptyLabel: string;
}) {
  if (points.length === 0) return <p className="insight-empty">{emptyLabel}</p>;
  const peak = Math.max(1, ...points.map((p) => p.value));

  return (
    <>
      <div className="flex h-[56px] items-end gap-1" data-tone={tone}>
        {points.map((p) => (
          <div
            key={p.label}
            className="group/col flex flex-1 flex-col items-center justify-end gap-1"
            title={`${p.label}: ${p.value}`}
          >
            <span className="font-mono text-[9px] tabular-nums text-ink-3 opacity-0 transition-opacity group-hover/col:opacity-100">
              {p.value}
            </span>
            <span
              className="plot-col w-full"
              data-empty={p.value === 0}
              style={{ height: p.value === 0 ? 3 : Math.max(5, (p.value / peak) * 42) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[8.5px] uppercase tracking-wider text-ink-3">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </>
  );
}

/**
 * A single figure with its caption, for a panel that reports one thing.
 * Sized a step below ReadingStrip so it never competes with the strip above.
 */
export function Figure({
  value,
  unit,
  caption,
  tone = "accent",
  emptyLabel = "Not enough data yet.",
}: {
  value: number | null;
  unit?: string;
  caption: string;
  tone?: Tone;
  emptyLabel?: string;
}) {
  if (value === null) return <p className="insight-empty">{emptyLabel}</p>;
  return (
    <div data-tone={tone}>
      <div className="font-display text-[24px] font-bold leading-none tabular-nums text-ink">
        {formatValue(value)}
        {unit && <span className="reading-unit">{unit}</span>}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-2">{caption}</p>
    </div>
  );
}

import type { CaseClock } from "@/lib/offroad";

/**
 * The countdown, drawn as a ring.
 *
 * A ring rather than a bar because these sit at the corner of a list card
 * where a bar would need a full row to itself, and because the reading that
 * matters is a single number — days left — which belongs in the middle of
 * something, not beside it.
 *
 * Overdue keeps filling past 100% visually by staying full and turning red,
 * rather than wrapping round to a second lap: "very overdue" and "just started"
 * must never draw the same arc.
 */
export function CaseClockRing({
  clock,
  size = 46,
}: {
  clock: CaseClock;
  size?: number;
}) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = clock.overdue ? 100 : clock.pct;
  const dash = (pct / 100) * circumference;

  const color = toneVar(clock.tone);

  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clock.label}. ${clock.elapsedDays} of ${clock.days} days elapsed.`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--surface-3)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          style={{ transition: "stroke-dasharray 0.4s var(--ease-standard)" }}
        />
      </svg>
      <span
        className="absolute grid place-items-center font-mono text-[12px] font-bold leading-none tnum"
        style={{ color }}
      >
        {clock.overdue ? `+${clock.overdueDays}` : clock.daysLeft}
      </span>
    </span>
  );
}

/**
 * The same reading as a line of text, for detail panels and table rows where
 * a ring would be decoration. Shows the revision when there has been one,
 * because a window that has already been extended reads very differently from
 * one that has not.
 */
export function CaseClockLine({ clock }: { clock: CaseClock }) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span className="font-mono text-[12px] font-bold tnum" style={{ color: toneVar(clock.tone) }}>
        {clock.label}
      </span>
      <span className="font-mono text-[10.5px] text-ink-3 tnum">
        day {Math.min(clock.elapsedDays, clock.days)} of {clock.days}
      </span>
      {clock.revised && (
        <span className="font-mono text-[10.5px] text-ink-3">
          · revised from {clock.originalDays}d
        </span>
      )}
    </span>
  );
}

function toneVar(tone: string): string {
  switch (tone) {
    case "ok":
      return "var(--ok)";
    case "warn":
      return "var(--warn)";
    case "bad":
      return "var(--bad)";
    case "accent":
      return "var(--accent)";
    default:
      return "var(--ink-3)";
  }
}

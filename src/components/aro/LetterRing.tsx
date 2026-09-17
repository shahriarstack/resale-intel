import { Check, Gavel } from "lucide-react";
import type { Tone } from "@/lib/status";
import { LETTER_GAP_DAYS, LETTER_SEQUENCE, type LetterSchedule } from "@/lib/letterSchedule";
import type { NextAction } from "@/lib/letterSchedule";

/**
 * The letter ladder, drawn as a ring.
 *
 * The off-road ring counts ONE window down, so a plain arc says everything
 * there is to say. A captured file is not one window — it is three, run
 * end to end: Letter 1 the day after capture, Letter 2 seven days later,
 * Letter 3 seven days after that. A single arc would have to pick which of
 * those it was drawing and throw the other two away.
 *
 * So the track is cut into three, one arc per letter, and the ring answers
 * both questions the officer actually has at once:
 *
 *   how far through the ladder is this file   the number of filled arcs
 *   how long until the next thing is owed     the figure in the middle
 *
 * Filled arcs are jade and permanent — a served letter cannot be unserved. The
 * arc for the letter currently running fills with elapsed time in its own
 * tone, so a file drifting towards a deadline visibly closes its gap before it
 * ever turns red. Arcs not yet started stay on the track colour.
 *
 * Reading it takes no instruction: three arcs, three letters, and the more of
 * the circle that is coloured the further along the file is.
 */

const SIZE = 38;
const STROKE = 3.5;
/** Degrees of blank between arcs. Enough to read as three, not as a dashed
 *  circle — below about 8 the segments visually fuse at this diameter. */
const GAP_DEG = 11;

export function LetterRing({
  schedule,
  next,
}: {
  schedule: LetterSchedule;
  next: NextAction;
}) {
  const r = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const segment = circumference / 3;
  const gap = (GAP_DEG / 360) * circumference;
  const arc = segment - gap;

  // How much of the running letter's own window has gone.
  //
  // Measured against that letter's gap — one day for Letter 1, seven for the
  // other two — rather than against the whole ladder, because the arc is the
  // window and not the file. Letter 1's arc is therefore nearly binary, which
  // is honest: it is owed the morning after the seizure.
  let runningFrac = 0;
  if (next.kind === "ISSUE_LETTER") {
    const total = LETTER_GAP_DAYS[next.step.key];
    runningFrac = clamp((total - next.step.daysLeft) / total, 0, 1);
    // Overdue fills its arc and stops. It must never lap into the next
    // letter's segment: "three weeks late" and "served" would draw the
    // same ring.
    if (next.step.overdue) runningFrac = 1;
    // A floor, so a letter whose window has only just opened still shows that
    // it is RUNNING. Letter 1's window is one day, so the honest fraction on
    // the day of capture is zero — which drew a bare round linecap sitting on
    // the track like a speck of dust, and read as "not started" when the
    // clock is in fact ticking. A visible sliver is the truer statement.
    else runningFrac = Math.max(runningFrac, 0.09);
  }

  const servedCount = schedule.steps.filter((s) => s.issued).length;
  const complete = schedule.complete;
  const tone = toneVar(next.tone);

  return (
    <span
      className="relative grid shrink-0 place-items-center"
      style={{ width: SIZE, height: SIZE }}
      role="img"
      aria-label={ariaLabel(schedule, next, servedCount)}
    >
      <svg width={SIZE} height={SIZE} className="-rotate-90" aria-hidden>
        {LETTER_SEQUENCE.map((key, i) => {
          const step = schedule.steps[i];
          // Each arc is one dash on its own circle, pushed round by whole
          // segments. Drawing them this way rather than as one dasharray keeps
          // every arc independently colourable, which is the whole point.
          const offset = -(i * segment);
          const running = next.kind === "ISSUE_LETTER" && next.step.key === key;

          return (
            <g key={key}>
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={r}
                fill="none"
                stroke="var(--surface-3)"
                strokeWidth={STROKE}
                strokeLinecap="round"
                strokeDasharray={`${arc} ${circumference - arc}`}
                strokeDashoffset={offset}
              />
              {(step.issued || running) && (
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={r}
                  fill="none"
                  stroke={step.issued ? "var(--ok)" : tone}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={`${arc * (step.issued ? 1 : runningFrac)} ${
                    circumference - arc * (step.issued ? 1 : runningFrac)
                  }`}
                  strokeDashoffset={offset}
                  style={{ transition: "stroke-dasharray 0.45s var(--ease-standard)" }}
                />
              )}
            </g>
          );
        })}
      </svg>

      <span className="absolute grid place-items-center leading-none">
        <Centre next={next} complete={complete} tone={tone} />
      </span>
    </span>
  );
}

/**
 * What sits in the hole.
 *
 * A figure while the ladder is running, because days-left is the reading the
 * officer came for. A glyph once it has stopped: there is no countdown left to
 * print, and a zero there would look like a deadline rather than the absence
 * of one.
 */
function Centre({
  next,
  complete,
  tone,
}: {
  next: NextAction;
  complete: boolean;
  tone: string;
}) {
  if (next.kind === "REQUEST_CN") {
    return <Gavel size={14} strokeWidth={2.1} style={{ color: "var(--accent)" }} />;
  }
  if (next.kind === "NONE") {
    // The row's own tone, so the glyph agrees with the banner above it: a file
    // whose Credit Note is with the manager is accent there and accent here,
    // and one that has moved on down the resale line is grey in both places.
    // Jade is reserved for a ladder that actually ran to completion.
    return (
      <Check size={15} strokeWidth={2.6} style={{ color: complete ? "var(--ok)" : tone }} />
    );
  }

  const d = next.step.daysLeft;
  return (
    <span className="grid place-items-center">
      <span
        className="font-mono text-[12px] font-bold leading-none tnum"
        style={{ color: tone }}
      >
        {next.step.overdue ? `+${Math.abs(d)}` : d}
      </span>
      {/* Which rung, under the figure. Two characters, and it is what turns
          "4" from a number into "four days until Letter 2" — the arcs say the
          same thing, but only once you have counted them. */}
      <span
        className="mt-px font-mono text-[7.5px] font-semibold leading-none tracking-wider"
        style={{ color: "var(--ink-3)" }}
      >
        L{next.step.key.slice(-1)}
      </span>
    </span>
  );
}

function ariaLabel(schedule: LetterSchedule, next: NextAction, served: number): string {
  const head = `${served} of 3 letters served.`;
  if (next.kind === "REQUEST_CN") return `${head} Credit Note now due.`;
  if (next.kind === "NONE") return `${head} ${next.label}.`;
  return `${head} ${next.label} ${next.detail.toLowerCase()}.`;
}

function clamp(n: number, lo: number, hi: number): number {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}

function toneVar(tone: Tone): string {
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

import type { LetterStage } from "@prisma/client";
import type { Tone } from "@/lib/status";
import { LETTER_META } from "@/lib/status";

// ---------------------------------------------------------------------------
// The statutory letter schedule
//
// The escalation ladder is not a set of steps an officer climbs whenever they
// get round to it — it runs on a clock, and the clock starts the moment the
// vehicle is taken:
//
//   Letter 1  — the day after capture
//   Letter 2  — seven days after Letter 1
//   Letter 3  — seven days after Letter 2
//
// After Letter 3 the customer has had every notice they are owed, and the
// vehicle stops being returnable: Release is closed and the only way out of
// the file is a Credit Note. That last rule is the reason this module exists
// separately from `letter.ts`, which only ever described what a stage MEANS.
// This one says when it is due and what it forecloses.
//
// Every date here is DERIVED from the letter dates on the vehicle. Nothing
// schedules anything; a due date is a fact about dates already recorded, so a
// file cannot be quietly wrong because a job did not run.
// ---------------------------------------------------------------------------

/** Days from the previous milestone to when each letter falls due. */
export const LETTER_GAP_DAYS: Record<"LETTER_1" | "LETTER_2" | "LETTER_3", number> = {
  // From the capture date. One day, not zero: the vehicle is seized, the
  // paperwork is written up, the notice goes out the following morning.
  LETTER_1: 1,
  LETTER_2: 7,
  LETTER_3: 7,
};

const DAY_MS = 86_400_000;

export type LetterKey = "LETTER_1" | "LETTER_2" | "LETTER_3";

export const LETTER_SEQUENCE: LetterKey[] = ["LETTER_1", "LETTER_2", "LETTER_3"];

export interface LetterStep {
  key: LetterKey;
  label: string;
  /** When it was actually issued, if it has been. */
  issuedAt: Date | null;
  /**
   * When it falls due — from the previous letter's real issue date where there
   * is one, and from the planned ladder where there is not. Always present, so
   * every rung has a deadline something can be measured against.
   */
  dueAt: Date;
  issued: boolean;
  /** Due date has passed and it has not been issued. */
  overdue: boolean;
  /** Whole days until due; negative once overdue. */
  daysLeft: number;
  /** The step the officer should act on next. Exactly one step has this. */
  isNext: boolean;
  tone: Tone;
}

export interface LetterScheduleInput {
  captureDate: Date;
  letterStage: LetterStage;
  letter1At: Date | null;
  letter2At: Date | null;
  letter3At: Date | null;
}

export interface LetterSchedule {
  steps: LetterStep[];
  /** The next letter owed, or null once the ladder is complete. */
  next: LetterStep | null;
  /** Any letter past its due date and not yet issued. */
  overdueCount: number;
  /**
   * Release is closed once Letter 3 has gone out. The customer has had the
   * full notice period; from here the file resolves through a Credit Note.
   */
  releaseLocked: boolean;
  /** Short reason for the lock, shown where the Release button used to be. */
  lockReason: string | null;
  /** The ladder has run its course. */
  complete: boolean;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

/**
 * Which stage a set of issue dates amounts to.
 *
 * The dates are authoritative, not `letterStage`. The stage column is what the
 * old flow wrote and files still carry it, but once dates exist they are the
 * stronger fact — a Letter 2 date means Letter 2 went out, whatever a stale
 * stage says.
 */
export function stageFromDates(input: LetterScheduleInput): LetterStage {
  if (input.letter3At) return input.letterStage === "WRITTEN" ? "WRITTEN" : "LETTER_3";
  if (input.letter2At) return "LETTER_2";
  if (input.letter1At) return "LETTER_1";
  return input.letterStage;
}

export function letterSchedule(
  input: LetterScheduleInput,
  now: Date = new Date(),
): LetterSchedule {
  const issued: Record<LetterKey, Date | null> = {
    LETTER_1: input.letter1At,
    LETTER_2: input.letter2At,
    LETTER_3: input.letter3At,
  };

  // A file captured under the old flow has a stage but no dates. Treat the
  // stage as evidence the letter went out on an unknown day rather than
  // pretending it is still owed — otherwise every legacy record would light up
  // as overdue on the day this shipped.
  const stage = stageFromDates(input);
  const stageRung = LETTER_SEQUENCE.indexOf(stage as LetterKey);

  const steps: LetterStep[] = [];
  let nextFound = false;

  // The PLANNED ladder — what the dates would be if every letter went out the
  // day it fell due. Built cumulatively from the capture date so that a rung
  // whose predecessor has no recorded date still has a deadline to answer to.
  //
  // Actual dates always win where they exist; this is the fallback, and it
  // exists because of the files captured before dates were recorded at all.
  // Those have a stage and nothing else, and leaving their next letter with no
  // due date would quietly exempt the oldest files in the book from the only
  // schedule that governs them.
  const planned: Record<LetterKey, Date> = {} as Record<LetterKey, Date>;
  let cursor = input.captureDate;
  for (const key of LETTER_SEQUENCE) {
    cursor = addDays(cursor, LETTER_GAP_DAYS[key]);
    planned[key] = cursor;
  }

  LETTER_SEQUENCE.forEach((key, i) => {
    const at = issued[key];
    // Issued if we have a date, or if the stage has already passed this rung.
    const isIssued = at !== null || (stageRung >= i && stageRung !== -1) || stage === "WRITTEN";

    // The gap runs from the previous letter's ACTUAL issue date when we have
    // one — that is when the customer's notice period really started — and
    // from the planned ladder when we do not.
    const prevActual = i === 0 ? input.captureDate : issued[LETTER_SEQUENCE[i - 1]];
    const dueAt = prevActual ? addDays(prevActual, LETTER_GAP_DAYS[key]) : planned[key];

    const daysLeft = dayDiff(now, dueAt);
    const overdue = !isIssued && daysLeft < 0;
    const isNext = !isIssued && !nextFound;
    if (isNext) nextFound = true;

    steps.push({
      key,
      label: LETTER_META[key].label,
      issuedAt: at,
      dueAt,
      issued: isIssued,
      overdue,
      daysLeft,
      isNext,
      tone: isIssued ? "ok" : overdue ? "bad" : daysLeft <= 1 ? "warn" : "neutral",
    });
  });

  const complete = steps.every((s) => s.issued);
  const releaseLocked = steps[2].issued;

  return {
    steps,
    next: steps.find((s) => s.isNext) ?? null,
    overdueCount: steps.filter((s) => s.overdue).length,
    releaseLocked,
    lockReason: releaseLocked
      ? "Letter 3 has been issued — the vehicle is no longer returnable. Resolve through a Credit Note."
      : null,
    complete,
  };
}

/**
 * The column to stamp when a given stage is set.
 *
 * Returned as a key rather than written here so the API route stays the only
 * thing that touches the database, and so a caller that is only previewing a
 * change does not have to know the column names.
 */
export function dateFieldForStage(stage: LetterStage): "letter1At" | "letter2At" | "letter3At" | null {
  switch (stage) {
    case "LETTER_1":
      return "letter1At";
    case "LETTER_2":
      return "letter2At";
    case "LETTER_3":
      return "letter3At";
    default:
      // NONE has no date to stamp, and WRITTEN is a formal outcome recorded
      // after Letter 3 rather than a fourth rung with its own deadline.
      return null;
  }
}

/**
 * May this vehicle still be released to its customer?
 *
 * The single question the Release button asks. It takes the raw record rather
 * than a schedule so callers that have not built one — a list row, a bulk
 * action — do not have to.
 */
export function canReleaseVehicle(v: {
  letterStage: LetterStage;
  letter3At: Date | null;
}): boolean {
  return !v.letter3At && v.letterStage !== "LETTER_3" && v.letterStage !== "WRITTEN";
}

// ---------------------------------------------------------------------------
// What to do next
//
// The schedule above says what is TRUE about a file's letters. This says what
// the officer should DO about it, which is a different question and the only
// one they actually have while standing in a yard with forty files.
//
// It exists because the ladder is self-driving. Nothing about it needs a
// decision: Letter 1 is owed the day after capture, Letter 2 seven days after
// Letter 1, Letter 3 seven days after that — and once Letter 3 is served the
// vehicle stops being returnable and the only route out is a Credit Note. At
// no point is there a choice to make. So the card should not present a choice;
// it should present the next step, already named, with the button that does it.
// ---------------------------------------------------------------------------

export type NextAction =
  | {
      kind: "ISSUE_LETTER";
      /** The rung to serve. */
      step: LetterStep;
      /** Headline for the prompt, e.g. "Issue Letter 2". */
      label: string;
      /** When it is owed, in the officer's words. */
      detail: string;
      /** Past its due date. */
      overdue: boolean;
      /** Owed today or already late — the officer should act now. */
      due: boolean;
      tone: Tone;
    }
  | {
      kind: "REQUEST_CN";
      label: string;
      detail: string;
      overdue: false;
      due: true;
      tone: Tone;
    }
  | { kind: "NONE"; label: string; detail: string; overdue: false; due: false; tone: Tone };

/**
 * The single next step on a captured file.
 *
 * `status` is taken rather than assumed because the ladder only applies while
 * the file is in the field team's hands: once it has moved to CN_REQUESTED or
 * beyond, the officer has nothing left to do on it and being told to issue a
 * letter would be wrong.
 */
export function nextAction(
  input: LetterScheduleInput & { status?: string },
  now: Date = new Date(),
): NextAction {
  const schedule = letterSchedule(input, now);

  if (input.status === "CN_REQUESTED") {
    return {
      kind: "NONE",
      label: "Credit Note sent",
      detail: "With the manager",
      overdue: false,
      due: false,
      tone: "accent",
    };
  }

  if (input.status && input.status !== "CAPTURED") {
    return {
      kind: "NONE",
      label: "In the resale line",
      detail: "Nothing owed from you",
      overdue: false,
      due: false,
      tone: "neutral",
    };
  }

  // The ladder has run. The customer has had every notice they are owed, the
  // vehicle is no longer returnable, and the file resolves through a Credit
  // Note — so that is the instruction, not a suggestion among options.
  if (schedule.complete) {
    return {
      kind: "REQUEST_CN",
      label: "Request Credit Note",
      detail: "All 3 letters served",
      overdue: false,
      due: true,
      tone: "accent",
    };
  }

  const step = schedule.next!;
  const days = step.daysLeft;

  return {
    kind: "ISSUE_LETTER",
    step,
    label: `Issue ${step.label}`,
    detail: step.overdue
      ? `Owed ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`
      : days === 0
        ? "Owed today"
        : days === 1
          ? "Owed tomorrow"
          : `Owed in ${days} days`,
    overdue: step.overdue,
    due: days <= 0,
    tone: step.overdue ? "bad" : days <= 1 ? "warn" : "neutral",
  };
}

// ---------------------------------------------------------------------------
// May this letter be served yet?
//
// The ladder is a notice period, and a notice period only means anything if it
// is actually served in order and actually spaced. Two rules, and both are
// enforced here rather than by hiding a button, because a button is not the
// authority on what the record permits:
//
//   ORDER   Letter 2 cannot be served before Letter 1. A customer cannot be
//           sent a second reminder they never received a first of, and a file
//           that jumps to Letter 3 has skipped the two notices that make the
//           third one lawful.
//
//   TIMING  Letter 1 falls due the day after capture, Letter 2 seven days
//           after Letter 1 went out, Letter 3 seven days after Letter 2. A
//           letter recorded before its due date is a letter recorded before it
//           was sent — the whole ladder collapses into three clicks on the
//           afternoon of the seizure, which is exactly the thing the schedule
//           exists to prevent.
//
// Nothing here blocks a letter that is LATE. Late is a fact about the world
// and the record has to be able to say it happened.
// ---------------------------------------------------------------------------

export interface LetterGateResult {
  ok: boolean;
  /** Why not, in the officer's words. Null when allowed. */
  reason: string | null;
}

export function canIssueLetter(
  input: LetterScheduleInput,
  target: LetterStage,
  now: Date = new Date(),
): LetterGateResult {
  // NONE and WRITTEN are not rungs. WRITTEN is a formal outcome recorded after
  // the ladder has run, so it is gated on the ladder being complete instead.
  if (target === "NONE") {
    return { ok: false, reason: "A letter cannot be un-issued." };
  }

  const schedule = letterSchedule(input, now);

  if (target === "WRITTEN") {
    return schedule.complete
      ? { ok: true, reason: null }
      : {
          ok: false,
          reason: "All three letters must be served before a vehicle is written off.",
        };
  }

  const step = schedule.steps.find((s) => s.key === target)!;

  if (step.issued) {
    return { ok: false, reason: `${step.label} has already been served.` };
  }

  // Order. `next` is the lowest unissued rung, so anything above it is a skip.
  if (schedule.next && schedule.next.key !== target) {
    return {
      ok: false,
      reason: `${schedule.next.label} has to go out first — the ladder runs in order.`,
    };
  }

  // Timing. `daysLeft` is whole days to the due date, so 0 means today.
  if (step.daysLeft > 0) {
    return {
      ok: false,
      reason:
        step.daysLeft === 1
          ? `${step.label} is not due until tomorrow.`
          : `${step.label} is not due for another ${step.daysLeft} days.`,
    };
  }

  return { ok: true, reason: null };
}

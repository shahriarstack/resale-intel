import type { RepairStage, RepairBlocker } from "@prisma/client";
import type { Tone } from "@/lib/status";

/**
 * Repair progress vocabulary.
 *
 * Four stages, not a percentage. A percentage invites invented precision from
 * someone standing next to a half-stripped vehicle, and a number nobody can
 * answer honestly gets guessed. These are states an engineer can pick without
 * thinking, which is the only way a field report actually gets filed.
 *
 * `AWAITING_PARTS` is a stage rather than a separate blocker flag because it is
 * the overwhelmingly common reason a repair stalls, and because a blocker that
 * lives on its own axis gets left switched on.
 */
export interface RepairStageMeta {
  stage: RepairStage;
  /** Label on the report control and in the audit trail. */
  label: string;
  /** What the engineer is actually saying, shown under the control. */
  blurb: string;
  tone: Tone;
  /** Ordering for progress rails. AWAITING_PARTS deliberately shares the
   *  position of IN_PROGRESS: it is a state of that phase, not a step past it. */
  step: number;
}

export const REPAIR_STAGE_META: Record<RepairStage, RepairStageMeta> = {
  NOT_STARTED: {
    stage: "NOT_STARTED",
    label: "Not started",
    blurb: "Approved, work has not begun",
    tone: "neutral",
    step: 0,
  },
  IN_PROGRESS: {
    stage: "IN_PROGRESS",
    label: "In progress",
    blurb: "Work is under way",
    tone: "accent",
    step: 1,
  },
  AWAITING_PARTS: {
    stage: "AWAITING_PARTS",
    label: "Awaiting parts",
    blurb: "Blocked until parts arrive",
    tone: "warn",
    step: 1,
  },
  READY: {
    stage: "READY",
    label: "Ready",
    blurb: "Repair finished, ready to hand over",
    tone: "ok",
    step: 2,
  },
};

/**
 * The stages offered on the report control, in the order they are shown.
 *
 * All four. `NOT_STARTED` is a real report — "this was approved and I have not
 * been able to start it" is exactly the thing a Service Manager needs to hear
 * early, and it is the report a deadline cannot make for itself.
 */
export const REPAIR_STAGES: RepairStage[] = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "AWAITING_PARTS",
  "READY",
];

/**
 * What an UNREPORTED live repair shows as.
 *
 * Approval is the start of the work, not a prelude to it, so a repair nobody
 * has reported on reads as in progress rather than as a blank control waiting
 * to be discovered. Derived rather than written at approval time: the Service
 * Head's transition has enough to do, and a default that lives in one function
 * cannot be half-applied to the rows that already exist.
 *
 * A DEFAULT IS A SUGGESTION UNTIL IT IS CONFIRMED, and that is what keeps it
 * compatible with the ratchet. Nothing has been CLAIMED on an unreported
 * repair — the engineer has not said anything yet — so every stage is still
 * open to them, `NOT_STARTED` included. The ratchet begins to bind at the
 * first real report, which is the first moment there is a statement to be
 * stuck with. Reading the displayed default as though it had been filed would
 * lock the one report the default might be wrong about.
 */
export function currentStage(stage: RepairStage | null | undefined): RepairStage {
  return stage ?? "IN_PROGRESS";
}

/** True when the stage means the repair is blocked rather than moving. */
export function isBlocked(stage: RepairStage | null | undefined): boolean {
  return stage === "AWAITING_PARTS";
}

export function stageLabel(stage: RepairStage | null | undefined): string {
  return stage ? REPAIR_STAGE_META[stage].label : "Not reported";
}

// ---------------------------------------------------------------------------
// The ratchet
// ---------------------------------------------------------------------------

/**
 * A repair report only ever goes forward.
 *
 * A stage is a statement about a physical vehicle — work has begun, parts are
 * missing, it is finished — and un-saying one is not a correction, it is a
 * different claim about the past. The audit trail already holds every report
 * ever filed, so "I marked it wrong" is answered by filing the right one
 * NEXT, not by winding the control back to where it was. Left reversible, the
 * stamped `repairStage` on the row stops being a record of progress and
 * becomes a record of whatever was last tapped.
 *
 * THE RATCHET IS ON `step`, NOT ON THE ORDER OF THE BUTTONS, and that
 * distinction is the whole design:
 *
 *   NOT_STARTED      0
 *   IN_PROGRESS      1
 *   AWAITING_PARTS   1   ← the same step as IN_PROGRESS, deliberately
 *   READY            2
 *
 * `AWAITING_PARTS` is a state of the in-progress phase, not a step past it, so
 * moving between the two is SIDEWAYS. A naive left-to-right ratchet would let
 * an engineer report that parts are missing and then refuse to let them say
 * the parts arrived — locking the one transition that happens most often in a
 * workshop, and teaching them to stop filing progress at all.
 *
 * So: forward is allowed, sideways is allowed, backward is refused.
 */
export function stageStep(stage: RepairStage | null | undefined): number {
  return stage ? REPAIR_STAGE_META[stage].step : -1;
}

/** May this report be filed from where the job currently is? */
export function canReportStage(
  from: RepairStage | null | undefined,
  to: RepairStage,
): boolean {
  return stageStep(to) >= stageStep(from);
}

/**
 * Does this report move the job on, as opposed to sideways?
 *
 * What the confirmation gates. A forward step cannot be taken back, so it is
 * worth a question; a sideways one between in-progress and awaiting-parts is
 * reversible by definition — both directions are legal — so asking about it
 * would be a dialog with nothing at stake, on the screen where the whole
 * design is that a report costs one tap.
 */
export function isStageAdvance(
  from: RepairStage | null | undefined,
  to: RepairStage,
): boolean {
  return stageStep(to) > stageStep(from);
}

/** Why a report was refused, in the engineer's words. */
export function stageRefusal(from: RepairStage | null | undefined): string {
  return `This repair is already ${stageLabel(from).toLowerCase()}. A report only goes forward — to correct one, file the stage the job is actually at.`;
}

// ---------------------------------------------------------------------------
// Why the work stopped
// ---------------------------------------------------------------------------

/**
 * AWAITING_PARTS is the blocked stage, and blocked has two causes.
 *
 * Parts are the overwhelmingly common one, which is why the stage is named
 * after them — but a repair also stops for a lift nobody can free up, a
 * specialist who has not come, an authorisation that has not landed. Those
 * were being filed as "awaiting parts" because it was the only way to say
 * stopped, which quietly turned the one figure a Service Manager chases —
 * how much of the workshop is waiting on the parts desk — into a lie.
 *
 * Two values, not seven. An engineer standing next to a vehicle picks from
 * two; the only distinction the workshop acts on is whether somebody is
 * waiting for a thing to arrive or something else is wrong, and those are
 * chased by different people.
 */
export const BLOCKER_META: Record<RepairBlocker, { label: string; blurb: string }> = {
  PARTS: {
    label: "Waiting on parts",
    blurb: "Ordered or on its way — nothing to do until it lands",
  },
  OTHER: {
    label: "Other issue",
    blurb: "Stopped for another reason — say what in a line",
  },
};

export const BLOCKERS: RepairBlocker[] = ["PARTS", "OTHER"];

/** What a blocked repair says on a card. */
export function blockedLabel(blocker: RepairBlocker | null | undefined): string {
  return blocker ? BLOCKER_META[blocker].label : REPAIR_STAGE_META.AWAITING_PARTS.label;
}

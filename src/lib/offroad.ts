import type {
  AccidentSeverity,
  CaptureRequestStatus,
  CaseFlagKind,
  OffroadCaseStatus,
  OffroadKind,
  ThanaReason,
  VehicleCondition,
} from "@prisma/client";
import type { Tone } from "@/lib/status";

// ---------------------------------------------------------------------------
// Presentation vocabulary
//
// Every label the two off-road flows show lives here, for the same reason
// STATUS_META exists: these words appear on the ARO's phone, the manager's
// board, the admin roll-up and three different chips, and a set of strings
// spelled out at each of those sites drifts apart within a month.
// ---------------------------------------------------------------------------

export interface KindMeta {
  label: string;
  /** Short form for chips and tab pills, where the full word will not fit. */
  short: string;
  tone: Tone;
  /** What the countdown on this kind of case is counting down TO. */
  clockLabel: string;
  /** Plain-language description of what this intake is for. */
  blurb: string;
}

export const OFFROAD_KIND_META: Record<OffroadKind, KindMeta> = {
  ACCIDENT: {
    label: "Accident",
    short: "Accident",
    tone: "warn",
    clockLabel: "Repair window",
    blurb:
      "The vehicle is damaged and off the road. Tracked until it is repaired and back with the customer — or written off and captured.",
  },
  THANA: {
    label: "Thana / Police",
    short: "Thana",
    tone: "bad",
    clockLabel: "Case window",
    blurb:
      "The vehicle is in police or legal custody. Tracked until it is released — back to the customer, or to us for resale.",
  },
};

export interface CaseStatusMeta {
  label: string;
  tone: Tone;
  /** Is this case still consuming anyone's attention? */
  open: boolean;
}

export const OFFROAD_STATUS_META: Record<OffroadCaseStatus, CaseStatusMeta> = {
  OPEN: { label: "Open", tone: "warn", open: true },
  RESOLVED_ONROAD: { label: "Back on-road", tone: "ok", open: false },
  RELEASED_TO_CUSTOMER: { label: "Released to customer", tone: "neutral", open: false },
  CONVERTED_TO_CAPTURE: { label: "Captured", tone: "accent", open: false },
};

export const ACCIDENT_SEVERITY_META: Record<
  AccidentSeverity,
  { label: string; tone: Tone; hint: string }
> = {
  MINOR: { label: "Minor", tone: "ok", hint: "Cosmetic damage — still driveable" },
  MODERATE: { label: "Moderate", tone: "warn", hint: "Needs workshop time, repairable" },
  MAJOR: { label: "Major", tone: "bad", hint: "Extensive structural or mechanical damage" },
  TOTAL_LOSS: { label: "Total loss", tone: "bad", hint: "Beyond economic repair" },
};

export const THANA_REASON_META: Record<ThanaReason, { label: string; hint: string }> = {
  ACCIDENT: { label: "Accident case", hint: "Seized following a road traffic accident" },
  DRUG_CASE: { label: "Drug case", hint: "Held in connection with a narcotics case" },
  ILLEGAL_GOODS: { label: "Illegal goods", hint: "Carrying prohibited or undeclared cargo" },
  THEFT: { label: "Theft", hint: "Recovered stolen, or held as evidence in a theft case" },
  CUSTOMS: { label: "Customs", hint: "Detained by customs or revenue authorities" },
  OTHER: { label: "Other", hint: "Anything else — describe it below" },
};

export const CAPTURE_REQUEST_META: Record<
  CaptureRequestStatus,
  { label: string; tone: Tone; hint: string }
> = {
  PENDING: {
    label: "Awaiting approval",
    tone: "warn",
    hint: "With the Recovery Manager for a decision.",
  },
  APPROVED: {
    label: "Approved",
    tone: "ok",
    hint: "Cleared to capture. Complete the capture form once the vehicle is in hand.",
  },
  DECLINED: { label: "Declined", tone: "bad", hint: "Refused, with a reason on record." },
  CAPTURED: { label: "Captured", tone: "accent", hint: "The approval was used." },
  WITHDRAWN: {
    label: "Withdrawn",
    tone: "neutral",
    hint: "Pulled by the officer — no longer needed.",
  },
};

/**
 * How a seized vehicle presents, in the two answers custody actually needs.
 *
 * The capture form's three-state `VehicleCondition` is reused for storage —
 * there is no point in a second enum for the same column — but a Thana case
 * only ever records two of them, and it words them differently. "Off-road" is
 * the wrong phrase inside a form about a vehicle that is by definition off the
 * road; what the desk is asking is whether it will drive out of the compound.
 */
export const CUSTODY_CONDITION_META: Record<
  "ON_ROAD" | "OFF_ROAD",
  { label: string; hint: string; tone: Tone }
> = {
  ON_ROAD: {
    label: "Running condition",
    hint: "Will drive out under its own power",
    tone: "ok",
  },
  OFF_ROAD: {
    label: "Not running",
    hint: "Will need recovery when released",
    tone: "warn",
  },
};

/** Vehicle condition, reused from the capture form's own three-state answer. */
export const CONDITION_META: Record<VehicleCondition, { label: string; tone: Tone }> = {
  ON_ROAD: { label: "On-road", tone: "ok" },
  OFF_ROAD: { label: "Off-road", tone: "warn" },
  ACCIDENT: { label: "Accident", tone: "bad" },
};

// ---------------------------------------------------------------------------
// The countdown
//
// Both kinds of case carry the same promise: "this vehicle will be off the
// road for about N days". The clock turns that promise into the one reading a
// desk actually acts on — is this case still inside the window it was opened
// with, and if not, by how much.
//
// Derived, never stored. There is no job that flips a case to "overdue" at
// midnight, so there is no job to fail and no case that can end up half-stale
// because a batch died partway through the table. The same rule the resale
// cycle already follows.
// ---------------------------------------------------------------------------

export interface CaseClock {
  /** The estimate in force: the manager's revision when there is one. */
  days: number;
  /** Whether that estimate has been revised away from what the field said. */
  revised: boolean;
  /** The original field estimate, kept so the drift stays visible. */
  originalDays: number;
  dueAt: Date;
  /** Whole days from today to the due date. Negative once it has passed. */
  daysLeft: number;
  /** Days past due, or 0. */
  overdueDays: number;
  /** Days since the vehicle went off the road. */
  elapsedDays: number;
  /** How far through the window we are, capped at 100. */
  pct: number;
  overdue: boolean;
  tone: Tone;
  /** "6 days left", "due today", "4 days overdue". */
  label: string;
}

const DAY_MS = 86_400_000;

/** Whole days between two instants, floored to the calendar day boundary. */
function dayDiff(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / DAY_MS);
}

export function caseClock(
  input: { occurredAt: Date; approxDays: number; revisedDays: number | null },
  now: Date = new Date(),
): CaseClock {
  const days = input.revisedDays ?? input.approxDays;
  const dueAt = new Date(input.occurredAt.getTime() + days * DAY_MS);

  const daysLeft = dayDiff(now, dueAt);
  const elapsedDays = Math.max(0, dayDiff(input.occurredAt, now));
  const overdue = daysLeft < 0;
  const overdueDays = overdue ? -daysLeft : 0;
  const pct = days > 0 ? Math.min(100, Math.round((elapsedDays / days) * 100)) : 100;

  // Three bands, and the amber one starts at three days rather than at some
  // fraction of the window: a two-day repair and a ninety-day court case are
  // both "getting close" when there are three days left, and a percentage
  // would call the first one urgent from the moment it opened.
  const tone: Tone = overdue ? "bad" : daysLeft <= 3 ? "warn" : "ok";

  const label = overdue
    ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`
    : daysLeft === 0
      ? "Due today"
      : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;

  return {
    days,
    revised: input.revisedDays !== null && input.revisedDays !== input.approxDays,
    originalDays: input.approxDays,
    dueAt,
    daysLeft,
    overdueDays,
    elapsedDays,
    pct,
    overdue,
    tone,
    label,
  };
}

// ---------------------------------------------------------------------------
// Outcomes
//
// The four ways a case ends, expressed as the actions a user can take on it.
// Named here rather than inferred at each button, so the ARO panel, the
// manager's board and the API all agree on what is possible from OPEN.
// ---------------------------------------------------------------------------

export type CaseAction =
  | "MARK_ONROAD"
  | "RELEASE_TO_CUSTOMER"
  | "CONVERT_TO_CAPTURE"
  | "REVISE_TIMELINE";

export interface CaseActionMeta {
  label: string;
  short: string;
  tone: "primary" | "ok" | "danger" | "ghost";
  /** Which kinds of case offer this action. */
  kinds: OffroadKind[];
  detail: string;
  /** Requires the officer to confirm they hold an NOC before proceeding. */
  requiresNoc?: boolean;
}

export const CASE_ACTIONS: Record<CaseAction, CaseActionMeta> = {
  MARK_ONROAD: {
    label: "Mark back on-road",
    short: "On-road",
    tone: "ok",
    kinds: ["ACCIDENT", "THANA"],
    detail:
      "The vehicle is repaired or released and back in service with the customer. The case closes and leaves the off-road list.",
  },
  RELEASE_TO_CUSTOMER: {
    label: "Released to customer",
    short: "Released",
    tone: "ghost",
    kinds: ["THANA"],
    detail:
      "The vehicle has been handed back to the customer by the authorities. The case closes with no resale.",
  },
  CONVERT_TO_CAPTURE: {
    label: "Convert to capture",
    short: "Capture",
    tone: "danger",
    kinds: ["ACCIDENT", "THANA"],
    requiresNoc: true,
    detail:
      "The vehicle is not going back to the customer. Confirm the NOC reference, complete the capture form, and the file joins the resale pipeline.",
  },
  REVISE_TIMELINE: {
    label: "Revise timeline",
    short: "Revise",
    tone: "primary",
    kinds: ["ACCIDENT", "THANA"],
    detail: "Change the number of days this case is expected to take.",
  },
};

/** The actions offered on an open case of this kind. */
export function actionsForKind(kind: OffroadKind): CaseAction[] {
  return (Object.keys(CASE_ACTIONS) as CaseAction[]).filter((a) =>
    CASE_ACTIONS[a].kinds.includes(kind),
  );
}

/**
 * The intake source stamped on a Vehicle created by converting this case.
 *
 * A one-line mapping, but it lives here rather than at the two call sites that
 * need it so adding a third kind of off-road case cannot leave one of them
 * writing DIRECT_CAPTURE by omission.
 */
export function intakeSourceForKind(kind: OffroadKind) {
  return kind === "ACCIDENT" ? ("FROM_ACCIDENT" as const) : ("FROM_THANA" as const);
}

/** A one-line summary of why a case exists, for list rows and chips. */
export function caseReasonLine(c: {
  kind: OffroadKind;
  accidentSeverity: AccidentSeverity | null;
  thanaReason: ThanaReason | null;
  thanaReasonNote: string | null;
  thanaName: string | null;
}): string {
  if (c.kind === "ACCIDENT") {
    return c.accidentSeverity ? ACCIDENT_SEVERITY_META[c.accidentSeverity].label : "Accident";
  }
  const reason = c.thanaReason ? THANA_REASON_META[c.thanaReason].label : "In custody";
  // For OTHER the list label is useless on its own, so the typed reason takes
  // its place rather than sitting behind it.
  const head = c.thanaReason === "OTHER" && c.thanaReasonNote ? c.thanaReasonNote : reason;
  return c.thanaName ? `${head} · ${c.thanaName}` : head;
}

// ---------------------------------------------------------------------------
// Case flags
// ---------------------------------------------------------------------------

export interface FlagMeta {
  /** What the raiser calls it. */
  label: string;
  /** The verb on the button that raises one. */
  raiseLabel: string;
  /** What the RECIPIENT sees at the top of the card. */
  inboundTitle: string;
  /** The verb on the button that closes it, for the recipient. */
  resolveLabel: string;
  tone: Tone;
  /** Which side raises this kind. */
  raisedBy: "field" | "desk";
  placeholder: string;
  detail: string;
}

/**
 * The two flags, described from both ends.
 *
 * Every string either side sees lives here rather than in the components,
 * because the same flag is read by two different people who need opposite
 * wording: to the officer a support request is "my ask", to the manager it is
 * "someone is stuck". Splitting those across two components is how they end up
 * describing the flag differently.
 */
export const FLAG_META: Record<CaseFlagKind, FlagMeta> = {
  SUPPORT_REQUEST: {
    label: "Support request",
    raiseLabel: "Ask for help",
    inboundTitle: "Officer needs support",
    resolveLabel: "Mark handled",
    tone: "accent",
    raisedBy: "field",
    placeholder:
      "What do you need? An authorisation, a document, a payment, someone to call the thana…",
    detail:
      "Sends this case to the Recovery Manager with your note. The case stays yours — this only asks for something you cannot do from the field.",
  },
  ATTENTION: {
    label: "Attention flag",
    raiseLabel: "Flag for the officer",
    inboundTitle: "Manager needs your attention",
    resolveLabel: "Mark done",
    tone: "warn",
    raisedBy: "desk",
    placeholder: "What should the officer do, and by when?",
    detail:
      "Puts this case at the top of the officer's list with your note. Use it to chase a case that has gone quiet or a window that is running out.",
  },
};

/** Which side is looking at a case. Drives every permission on the card. */
export type CaseViewer = "field" | "desk";

/**
 * The flag this viewer RAISES, and the flag they ANSWER.
 *
 * Each side raises one kind and closes the other. Stated once here so a card,
 * a modal and an API route cannot disagree about which way a given flag runs.
 */
export function flagsFor(viewer: CaseViewer): { raises: CaseFlagKind; answers: CaseFlagKind } {
  return viewer === "field"
    ? { raises: "SUPPORT_REQUEST", answers: "ATTENTION" }
    : { raises: "ATTENTION", answers: "SUPPORT_REQUEST" };
}

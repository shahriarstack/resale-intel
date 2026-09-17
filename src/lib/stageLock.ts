import type { EventType, Role, VehicleStatus } from "@prisma/client";
import { STATUS_META } from "@/lib/status";
import { ROLE_META, TRANSITIONS } from "@/lib/rbac";

/**
 * Desk locking.
 *
 * The rule the pipeline has always enforced, made visible: once you hand a
 * file on, your inputs close. They reopen only if the desk you handed it to
 * sends it back.
 *
 * Enforcement already lives in two places and is not moved here — every panel
 * is gated on status, and every API route re-checks status server-side before
 * writing. What was missing was the TELLING. A section that silently vanishes
 * when the file moves on reads as a bug; a section that says "you submitted
 * this on Tuesday, the Service Manager has it now" reads as a workflow.
 *
 * So this module answers one question — what state is this desk's section in
 * for this vehicle — and the UI renders it. It grants no permission of its own.
 */

export type LockState =
  /** Not this desk's business on this vehicle at all. */
  | "none"
  /** Will reach this desk later; nothing to do yet. */
  | "waiting"
  /** This desk's turn. Inputs are open. */
  | "open"
  /** Handed on. Inputs are closed until somebody sends it back. */
  | "locked"
  /** Sent back to this desk. Open again, and the reason is worth reading. */
  | "reopened";

export interface DeskLock {
  state: LockState;
  /** The status at which this desk works the file. */
  worksAt: VehicleStatus;
  /** Who is holding it now — only meaningful when locked. */
  heldBy: string;
  /** One line for the panel header. */
  headline: string;
  /** The rest of the explanation. */
  detail: string;
}

/**
 * The status each desk does its work at.
 *
 * Derived from the transition table rather than restated, so a desk that gains
 * or moves a step in `TRANSITIONS` cannot end up with a lock model that
 * disagrees with the state machine.
 */
export function workingStatusFor(role: Role): VehicleStatus | null {
  // A desk that owns several transitions works at the earliest of them; that
  // is where its inputs live (a send-back is an exit, not a workplace).
  const owned = TRANSITIONS.filter((t) => t.role === role).map((t) => t.from);
  if (owned.length === 0) return null;
  const order = PIPELINE_ORDER;
  return owned.sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
}

/** The chain in the order a file travels it. Terminal states sit outside. */
const PIPELINE_ORDER: VehicleStatus[] = [
  "CAPTURED",
  "CN_REQUESTED",
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
  "LIVE_FOR_RESALE",
  "SOLD",
];

/** The events that mean a file came BACK to a desk rather than arriving fresh. */
const SEND_BACK_EVENTS: EventType[] = [
  "CN_DECLINED",
  "REPAIR_SENT_BACK",
  "SENT_BACK",
];

export interface LockEvent {
  type: EventType;
  createdAt: string;
  note: string | null;
  actorName: string | null;
}

/**
 * Read the lock for one desk on one vehicle.
 *
 * `events` is the vehicle's audit trail, newest first — the same list the
 * timeline already renders, so this costs no extra query.
 */
export function readDeskLock(
  role: Role,
  status: VehicleStatus,
  events: LockEvent[],
): DeskLock {
  const worksAt = workingStatusFor(role);
  if (!worksAt) {
    return {
      state: "none",
      worksAt: status,
      heldBy: "—",
      headline: "",
      detail: "",
    };
  }

  const here = PIPELINE_ORDER.indexOf(status);
  const mine = PIPELINE_ORDER.indexOf(worksAt);
  const heldBy = STATUS_META[status]?.heldBy ?? "—";
  const label = ROLE_META[role]?.label ?? role;

  // A terminal status is outside the chain; treat it as fully past.
  const past = status === "RELEASED" || status === "SOLD" ? true : here > mine;

  if (status === worksAt) {
    // At this desk. Fresh work, or work that came back?
    // The most recent movement tells us how the file got here. A send-back at
    // the top of the trail means this is rework, not fresh work. Edits are
    // skipped: someone correcting a typo after a send-back must not make the
    // rework banner disappear.
    const latest = events.find(
      (e) => e.type !== "FIELD_EDITED" && e.type !== "LETTER_UPDATED",
    );
    const sentBack = latest && SEND_BACK_EVENTS.includes(latest.type) ? latest : null;

    if (sentBack) {
      return {
        state: "reopened",
        worksAt,
        heldBy,
        headline: "Sent back to you",
        detail: sentBack.note
          ? `${sentBack.actorName ?? "The next desk"}: “${sentBack.note}”`
          : `${sentBack.actorName ?? "The next desk"} returned this for changes.`,
      };
    }
    return {
      state: "open",
      worksAt,
      heldBy,
      headline: "Your turn",
      detail: "Your inputs are open. They close when you hand this on.",
    };
  }

  if (past) {
    return {
      state: "locked",
      worksAt,
      heldBy,
      headline: `Locked — ${heldBy} has this now`,
      detail: `You submitted this at the ${label} stage. It reopens only if ${heldBy} sends it back.`,
    };
  }

  return {
    state: "waiting",
    worksAt,
    heldBy,
    headline: "Not yet at your desk",
    detail: `This file is with ${heldBy}. It reaches you at ${STATUS_META[worksAt].label}.`,
  };
}

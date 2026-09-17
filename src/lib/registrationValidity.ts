/**
 * Registration's standing watch — the pure logic.
 *
 * Every other desk in this app is done with a vehicle the moment it moves on.
 * Registration is not: the paperwork they filed is only good for a window of
 * time, and the cost of renewing it keeps moving for as long as the vehicle
 * sits unsold — regardless of which desk currently holds the file, or how far
 * past Registration it has travelled.
 *
 * The window is DERIVED state read against `registrationValidUntil`, the same
 * pattern the resale cycle already uses (see lib/resale.ts): no scheduled job,
 * no batch that can half-run, a renewal takes effect the instant it is saved.
 *
 * A sold vehicle keeps its window on the record — the history should not lie
 * about what was true — but stops being anyone's alarm. The paperwork is the
 * new owner's problem now, not a thing Registration should still be chased on.
 *
 * No prisma import here, deliberately — this is the half of the feature that
 * a client component (the vehicle-page panel, the desk board) needs to import
 * directly to read a state without a round trip. The database read lives in
 * lib/registrationValidityBoard.ts, the same split lib/resale.ts and
 * lib/resaleDesk.ts already use for the same reason.
 */

import type { Tone } from "./status";

export const DEFAULT_VALID_DAYS = 60; // ≈ 2 months
export const EXPIRING_SOON_DAYS = 14;
export const MAX_VALID_DAYS = 730;

export type ValidityState = "expired" | "expiring" | "valid" | "sold" | "unset";

export interface ValidityRead {
  validUntil: Date | null;
  daysLeft: number | null;
  state: ValidityState;
}

export function readValidity(
  validUntil: Date | string | null | undefined,
  sold: boolean,
  now: Date = new Date(),
): ValidityRead {
  if (!validUntil) return { validUntil: null, daysLeft: null, state: "unset" };
  const at = typeof validUntil === "string" ? new Date(validUntil) : validUntil;
  const daysLeft = Math.ceil((at.getTime() - now.getTime()) / 86_400_000);

  const state: ValidityState = sold
    ? "sold"
    : daysLeft < 0
      ? "expired"
      : daysLeft <= EXPIRING_SOON_DAYS
        ? "expiring"
        : "valid";

  return { validUntil: at, daysLeft, state };
}

/** The shared label/tone for each state — the Registration desk's own panel
 *  and the marketplace listing both read off this, so a vehicle's paperwork
 *  is never described two different ways in two different places. */
export const STATE_META: Record<ValidityState, { label: string; tone: Tone }> = {
  expired: { label: "Expired", tone: "bad" },
  expiring: { label: "Ending soon", tone: "warn" },
  valid: { label: "Valid", tone: "ok" },
  sold: { label: "Sold", tone: "neutral" },
  unset: { label: "Not set", tone: "neutral" },
};

/**
 * The registration fact a BUYER is shown on a marketplace listing.
 *
 * Deliberately not the same copy as the desk's own chip: "Ending soon" means
 * something to Registration, who renews it; a buyer reads the same state as
 * "how long do I have before this needs doing", which is a different
 * sentence. Returns null for `sold` (the paperwork is the new owner's
 * problem, not a fact being sold to them) and `unset` (nothing to say yet —
 * should not happen for a live listing, since Registration's turn always
 * precedes the marketplace, but a null guard costs nothing).
 */
export function marketplaceRegFact(
  validUntil: Date | string | null | undefined,
  sold: boolean,
  now: Date = new Date(),
): { label: string; tone: Tone } | null {
  const { state, daysLeft } = readValidity(validUntil, sold, now);
  if (state === "unset" || state === "sold") return null;
  if (state === "expired") {
    return {
      label: `Reg. expired${daysLeft !== null ? ` ${Math.abs(daysLeft)}d ago` : ""}`,
      tone: "bad",
    };
  }
  if (state === "expiring") {
    return { label: `Reg. ends ${daysLeft}d`, tone: "warn" };
  }
  return { label: "Registered", tone: "ok" };
}

export interface ValidityRow {
  id: string;
  registrationNo: string;
  name: string;
  customerName: string;
  territory: string | null;
  status: string;
  sold: boolean;
  validUntil: string | null;
  validDays: number | null;
  daysLeft: number | null;
  state: ValidityState;
  /** The current registration-related cost estimate — renewal, fitness, or
   *  anything else Registration has itemised. Revisable at any time; this is
   *  always today’s figure, not the one the vehicle was first registered
   *  under. */
  costTotal: number;
  /** The lines behind that total, so the board can edit them in place rather
   *  than sending Registration off to another page to change a number. */
  lines: { description: string; amount: number }[];
}

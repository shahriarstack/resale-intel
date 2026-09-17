import type { Role } from "@prisma/client";

/**
 * Reading the offer book.
 *
 * An offer is a *customer's* price, carried in by a field officer. That single
 * fact drives everything below and is the one place this file differs from a
 * conventional auction:
 *
 *  - One officer may hold SEVERAL live offers on one vehicle, because they are
 *    fronting several buyers. So there is no "one row per bidder" collapse —
 *    every live offer stands on its own and is ranked purely on price.
 *  - Correcting an offer edits it in place; changing your mind withdraws it.
 *    Neither is a new row, so the book never fills with superseded figures the
 *    way a re-bidding auction does.
 *
 * Sealed sideways, open upward: an officer receives only their own offers, the
 * desks that choose a buyer receive the whole book with the officer, their
 * territory and their level attached.
 */

export interface OfferRow {
  id: string;
  /** The buyer this price is for. Null only on records predating named customers. */
  customerName: string | null;
  amount: number;
  /** Remarks — payment terms, buyer interest, conditions. */
  note: string | null;
  createdAt: string;
  revisedAt: string | null;
  withdrawnAt: string | null;

  /** The account that submitted. The audit fact — never rewritten. */
  bidderId: string;

  /**
   * Who the offer is CREDITED to: the sales officer whose customer this is,
   * or the field officer who brought it in themselves.
   *
   * The sales team shares one marketplace, so whoever is at the screen picks
   * the officer the offer belongs to. Everywhere management reads the book,
   * THESE are the fields shown — the submitting account is only interesting
   * when the two differ, which the UI says explicitly rather than by
   * silently showing one and meaning the other.
   */
  officerName: string;
  officerStaffId: string;
  officerRole: Role;
  /** "Sales Officer" / "ARO" / "Engineer" — see offerLevel in rbac. */
  officerLevel: string;
  /** Sales patch for a sales officer, recovery territory for an ARO. */
  officerTerritory: string | null;
  /** True when someone entered this on another officer's behalf. */
  enteredByOther: boolean;
  enteredByName: string | null;

  isMine: boolean;
}

/** Still on the table, best price first. Withdrawn offers drop out entirely. */
export function liveOffers(offers: OfferRow[]): OfferRow[] {
  return offers
    .filter((o) => !o.withdrawnAt)
    .sort((a, b) => b.amount - a.amount || Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The best live offer on the vehicle, or null when nobody has offered. */
export function topOffer(offers: OfferRow[]): OfferRow | null {
  return liveOffers(offers)[0] ?? null;
}

/** The viewer's own live offers, best first — what the storefront shows back. */
export function myOffers(offers: OfferRow[]): OfferRow[] {
  return liveOffers(offers).filter((o) => o.isMine);
}

/** How many distinct officers have a live offer in — the "interest" number. */
export function offererCount(offers: OfferRow[]): number {
  return new Set(liveOffers(offers).map((o) => o.bidderId)).size;
}

/** How an offer reads when it is one row in a list: "Rahim Traders · Tk 12,00,000". */
export function offerFor(o: OfferRow): string {
  return o.customerName?.trim() || "Unnamed customer";
}

/** The offers credited to one officer, best first. */
export function offersByOfficer(offers: OfferRow[], staffId: string): OfferRow[] {
  return liveOffers(offers).filter((o) => o.officerStaffId === staffId);
}

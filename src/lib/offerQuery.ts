import type { PostingKind, Prisma, Role } from "@prisma/client";
import { offerLevel } from "@/lib/rbac";
import type { OfferRow } from "@/lib/bids";

/**
 * Reading offers out of the database, in exactly one place.
 *
 * Four surfaces show the offer book — the marketplace, the vehicle file, the
 * Sr. Executive's resale desk and the offers API — and every one of them needs
 * the same join: the offer, the account that submitted it, and the officer it
 * is credited to. Writing that join four times is how three of them end up
 * showing the submitting account where they meant to show the credited
 * officer, months apart and without anyone noticing.
 *
 * So the select and the shaper live here together. Change what an offer shows
 * and every surface changes with it.
 */

/** The join every offer read needs. Spread into any Prisma `select`. */
export const OFFER_SELECT = {
  id: true,
  customerName: true,
  amount: true,
  note: true,
  createdAt: true,
  revisedAt: true,
  withdrawnAt: true,
  bidderId: true,
  salesOfficerId: true,
  bidder: {
    select: {
      name: true,
      staffId: true,
      role: true,
      salesTerritory: true,
      postings: { select: { kind: true, territory: { select: { name: true } } } },
    },
  },
  salesOfficer: {
    select: {
      name: true,
      staffId: true,
      role: true,
      salesTerritory: true,
      postings: { select: { kind: true, territory: { select: { name: true } } } },
    },
  },
} satisfies Prisma.BidSelect;

type Person = {
  name: string;
  staffId: string;
  role: Role;
  salesTerritory: string | null;
  postings: { kind: PostingKind; territory: { name: string } }[];
};

export type OfferRecord = {
  id: string;
  customerName: string | null;
  amount: number;
  note: string | null;
  createdAt: Date;
  revisedAt: Date | null;
  withdrawnAt: Date | null;
  bidderId: string;
  salesOfficerId: string | null;
  bidder: Person;
  salesOfficer: Person | null;
};

/**
 * Which geography to print beside an officer's name.
 *
 * A sales officer covers a sales patch; an ARO covers a recovery territory.
 * They are different maps (see `User.salesTerritory`), so the right one is
 * chosen from the role rather than by falling back from one to the other —
 * a fallback would quietly print an engineer's recovery territory under a
 * "Sales Officer" label the first time someone changed a role.
 */
function territoryFor(p: Person): string | null {
  if (p.role === "SALES_TEAM") return p.salesTerritory?.trim() || null;
  // The patch they are BASED in. An officer covering a vacant neighbour is
  // credited against their own posting here — the line under a name on an
  // offer says where that person belongs, not everywhere they are helping.
  return p.postings.find((x) => x.kind === "BASE")?.territory.name ?? null;
}

/**
 * One database row into one offer.
 *
 * `viewerId` decides `isMine`, and it is matched against BOTH the submitting
 * account and the credited officer: an officer whose colleague entered an
 * offer on their behalf still has to be able to see and manage it, or the
 * shared-desk workflow leaves them locked out of their own customer.
 */
export function shapeOffer(o: OfferRecord, viewerId: string): OfferRow {
  const officer = o.salesOfficer ?? o.bidder;
  const credited = o.salesOfficerId !== null && o.salesOfficerId !== o.bidderId;

  return {
    id: o.id,
    customerName: o.customerName,
    amount: o.amount,
    note: o.note,
    createdAt: o.createdAt.toISOString(),
    revisedAt: o.revisedAt?.toISOString() ?? null,
    withdrawnAt: o.withdrawnAt?.toISOString() ?? null,

    bidderId: o.bidderId,

    officerName: officer.name,
    officerStaffId: officer.staffId,
    officerRole: officer.role,
    officerLevel: offerLevel(officer.role),
    officerTerritory: territoryFor(officer),

    enteredByOther: credited,
    enteredByName: credited ? o.bidder.name : null,

    isMine: o.bidderId === viewerId || o.salesOfficerId === viewerId,
  };
}

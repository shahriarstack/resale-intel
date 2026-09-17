import type { RecoveryPart } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * The two maps this business actually runs on, read rather than maintained.
 *
 * Territories used to be a list somebody kept — add a row here, then go and
 * post an officer to it there, and hope the two stayed in step. They did not
 * have to: a patch could sit in the list for a year with nobody on it and
 * nothing said so, and an officer could be posted to a patch nobody had
 * classified.
 *
 * Both halves are now DERIVED FROM THE ROSTER, because the roster is the thing
 * that is true. A recovery patch exists because an officer is posted to it; a
 * sales patch exists because a sales officer is assigned to it. Nothing here
 * can be edited, and there is nothing to keep in step.
 *
 * THE TWO MAPS ARE NOT THE SAME MAP, which is why they are returned
 * separately rather than merged on a shared name. Recovery splits the country
 * into parts and staffs each patch with posted officers; sales draws its own
 * regions and holds them as free text on the officer. A name appearing in both
 * is a coincidence, and joining on it would invent a relationship the business
 * does not have.
 */

export interface RecoveryPatch {
  id: string;
  name: string;
  code: string | null;
  part: RecoveryPart | null;
  isActive: boolean;
  /** Officers posted here, the one based here first. */
  officers: { id: string; name: string; staffId: string; kind: "BASE" | "COVER" }[];
  /** Nobody is based here. The condition the coverage board exists to show. */
  unstaffed: boolean;
  /** Somebody covers it, but nobody belongs to it. */
  coveredOnly: boolean;
  vehicles: number;
}

export interface SalesPatch {
  name: string;
  officers: { id: string; name: string; staffId: string }[];
}

export interface TerritoryMap {
  recovery: RecoveryPatch[];
  sales: SalesPatch[];
  /** Headline counts, so the panel can lead with the exception. */
  totals: {
    recovery: number;
    recoveryUnstaffed: number;
    recoveryUnparted: number;
    sales: number;
  };
}

export async function getTerritoryMap(): Promise<TerritoryMap> {
  const [territories, salesOfficers] = await Promise.all([
    prisma.territory.findMany({
      orderBy: [{ part: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        part: true,
        isActive: true,
        postings: {
          // Based officers first: the person who belongs here reads before
          // whoever is standing in.
          orderBy: { kind: "asc" },
          select: {
            kind: true,
            user: { select: { id: true, name: true, staffId: true, isActive: true } },
          },
        },
        _count: { select: { vehicles: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "SALES_TEAM", salesTerritory: { not: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, staffId: true, salesTerritory: true },
    }),
  ]);

  const recovery: RecoveryPatch[] = territories.map((t) => {
    // A deactivated account is not cover. Counting them would report a patch
    // as staffed by somebody who cannot sign in.
    const officers = t.postings
      .filter((p) => p.user.isActive)
      .map((p) => ({
        id: p.user.id,
        name: p.user.name,
        staffId: p.user.staffId,
        kind: p.kind as "BASE" | "COVER",
      }));
    const based = officers.filter((o) => o.kind === "BASE");
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      part: t.part,
      isActive: t.isActive,
      officers,
      unstaffed: officers.length === 0,
      coveredOnly: officers.length > 0 && based.length === 0,
      vehicles: t._count.vehicles,
    };
  });

  // Sales patches are whatever the sales officers are assigned to. Grouped
  // case-insensitively so "Dhaka Metro" and "dhaka metro" read as one patch —
  // it is free text, and a typo should be visible as two officers on one row
  // rather than hidden as two rows with one each.
  const salesByKey = new Map<string, SalesPatch>();
  for (const u of salesOfficers) {
    const name = u.salesTerritory?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const found = salesByKey.get(key);
    if (found) {
      found.officers.push({ id: u.id, name: u.name, staffId: u.staffId });
    } else {
      salesByKey.set(key, {
        name,
        officers: [{ id: u.id, name: u.name, staffId: u.staffId }],
      });
    }
  }
  const sales = [...salesByKey.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    recovery,
    sales,
    totals: {
      recovery: recovery.length,
      recoveryUnstaffed: recovery.filter((r) => r.unstaffed).length,
      recoveryUnparted: recovery.filter((r) => !r.part).length,
      sales: sales.length,
    },
  };
}

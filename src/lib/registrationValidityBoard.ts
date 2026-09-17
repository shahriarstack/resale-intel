import { prisma } from "@/lib/prisma";
import { accountTitle } from "@/lib/vehicle";
import { readValidity, type ValidityRow, type ValidityState } from "@/lib/registrationValidity";

/**
 * The database half of Registration's standing watch — see
 * lib/registrationValidity.ts for the derivation logic this reads through.
 * Split into its own file so a client component can import the pure logic
 * without pulling prisma into the browser bundle.
 */

const STATE_RANK: Record<ValidityState, number> = {
  expired: 0,
  expiring: 1,
  valid: 2,
  sold: 3,
  unset: 4,
};

/**
 * Every vehicle Registration has ever completed, ranked by how urgently it
 * needs them again.
 *
 * Scoped to `registrationValidUntil { not: null }` rather than to a status —
 * that is the whole point: a vehicle long gone from Registration's queue,
 * already priced, listed, even sold, still shows up here for as long as the
 * window it was given still matters.
 */
export async function getRegistrationValidityBoard(): Promise<ValidityRow[]> {
  const rows = await prisma.vehicle.findMany({
    where: { registrationValidUntil: { not: null } },
    orderBy: { registrationValidUntil: "asc" },
    select: {
      id: true,
      registrationNo: true,
      make: true,
      model: true,
      customerName: true,
      customerCode: true,
      status: true,
      registrationValidUntil: true,
      registrationValidDays: true,
      territory: { select: { name: true } },
      regLines: { select: { description: true, amount: true }, orderBy: { createdAt: "asc" } },
    },
    take: 500,
  });

  const shaped: ValidityRow[] = rows.map((v) => {
    const sold = v.status === "SOLD";
    const read = readValidity(v.registrationValidUntil, sold);
    return {
      id: v.id,
      registrationNo: v.registrationNo,
      name: accountTitle(v),
      customerName: v.customerName,
      territory: v.territory?.name ?? null,
      status: v.status,
      sold,
      validUntil: read.validUntil?.toISOString() ?? null,
      validDays: v.registrationValidDays,
      daysLeft: read.daysLeft,
      state: read.state,
      costTotal: v.regLines.reduce((s, l) => s + l.amount, 0),
      lines: v.regLines.map((l) => ({ description: l.description, amount: l.amount })),
    };
  });

  // Most urgent first — expired, then closing in, then comfortably valid,
  // sold last of all regardless of date, since date no longer means anything
  // for those rows.
  return shaped.sort(
    (a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || (a.daysLeft ?? 0) - (b.daysLeft ?? 0),
  );
}

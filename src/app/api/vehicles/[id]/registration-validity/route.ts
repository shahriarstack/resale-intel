import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { registrationValiditySchema } from "@/lib/validation";
import { recordEvent } from "@/lib/audit";
import { taka, shortDate } from "@/lib/format";

/**
 * Registration's standing watch: renew the validity window, revise the cost
 * estimate, or both in one save.
 *
 * Deliberately not gated by `status`. Every other write in this app only
 * happens while a file sits at the one status that action belongs to — this
 * one is the exception, because the whole point of the feature is that
 * Registration's watch over the paperwork and its cost does not end when the
 * file moves on. A vehicle mid-repair, out for pricing, live on the
 * marketplace, or sold, is all fair game as long as it has been through
 * Registration once.
 *
 * `lines`, when sent, REPLACES the current cost breakdown — the same
 * wholesale-replace the initial submission uses. There is no versioned
 * history of the estimate itself, only the audit trail of what it changed to
 * and when; the estimate is meant to read as "what it would cost today", not
 * as a ledger of every guess along the way.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("REGISTRATION_TEAM");
    const { id } = await context.params;
    // Registration cost lines never carry a photo — that field on the shared
    // costLineSchema exists for the repair estimate, not this one.
    const { days, lines } = registrationValiditySchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        registrationValidUntil: true,
        regLines: { select: { amount: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    if (!vehicle.registrationValidUntil) {
      return fail("This vehicle has not been registered yet — nothing to renew", 409);
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + days);
    validUntil.setHours(23, 59, 59, 0);

    const oldTotal = vehicle.regLines.reduce((s, l) => s + l.amount, 0);
    const newTotal = lines ? lines.reduce((s, l) => s + l.amount, 0) : oldTotal;
    const costChanged = lines !== undefined && newTotal !== oldTotal;

    await prisma.$transaction(async (tx) => {
      if (lines) {
        await tx.registrationCostLine.deleteMany({ where: { vehicleId: id } });
        if (lines.length > 0) {
          await tx.registrationCostLine.createMany({
            data: lines.map((l) => ({
              vehicleId: id,
              description: l.description,
              amount: l.amount,
              createdById: user.id,
            })),
          });
        }
      }

      await tx.vehicle.update({
        where: { id },
        data: { registrationValidUntil: validUntil, registrationValidDays: days },
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "REGISTRATION_VALIDITY_RENEWED",
        field: "registrationValidUntil",
        oldValue: shortDate(vehicle.registrationValidUntil),
        newValue: shortDate(validUntil),
        note: costChanged
          ? `Estimate ${taka(oldTotal)} → ${taka(newTotal)} · valid ${days} more day${days === 1 ? "" : "s"}`
          : `Estimate unchanged at ${taka(newTotal)} · valid ${days} more day${days === 1 ? "" : "s"}`,
      });
    });

    return ok({ validUntil: validUntil.toISOString(), days, costTotal: newTotal });
  },
);

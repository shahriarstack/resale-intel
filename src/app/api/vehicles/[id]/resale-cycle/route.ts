import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resaleCycleSchema } from "@/lib/validation";
import { canManageResaleCycle } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { MAX_EXTENSION_DAYS, readCycle } from "@/lib/resale";

const DAY = 86_400_000;

/**
 * Extend a vehicle's pricing month.
 *
 * The hold that ends a month is derived from `resaleCycleEndsAt`, so moving
 * that date IS the extension — there is no separate hold flag to keep in step.
 *
 * Forward only, and bounded. Pulling the date backwards would hold a vehicle
 * mid-month without re-pricing it, and an unbounded extension turns "buy a few
 * days" into "never revise again", which is the one thing the monthly cycle
 * exists to prevent.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SR_EXECUTIVE");
    const { id } = await context.params;
    const { endsAt } = resaleCycleSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true, resaleCycleEndsAt: true },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (!canManageResaleCycle(user.role, vehicle.status)) {
      return fail("Only a vehicle on the marketplace has a pricing month", 409);
    }

    const now = new Date();
    if (endsAt.getTime() <= now.getTime()) {
      return fail("Choose a date in the future", 422);
    }

    const ceiling = now.getTime() + MAX_EXTENSION_DAYS * DAY;
    if (endsAt.getTime() > ceiling) {
      return fail(
        `A pricing month can be extended by at most ${MAX_EXTENSION_DAYS} days`,
        422,
      );
    }

    const current = readCycle(vehicle.resaleCycleEndsAt, now);
    if (current.endsAt && endsAt.getTime() <= current.endsAt.getTime()) {
      return fail("The new date must be later than the current one", 422);
    }

    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id }, data: { resaleCycleEndsAt: endsAt } });
      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "PRICE_REVISED",
        field: "resaleCycle",
        oldValue: current.endsAt ? current.endsAt.toISOString().slice(0, 10) : "—",
        newValue: endsAt.toISOString().slice(0, 10),
        note: current.onHold
          ? "Hold lifted — pricing month extended"
          : "Pricing month extended",
      });
    });

    return ok({ endsAt: endsAt.toISOString() });
  },
);

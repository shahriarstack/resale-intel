import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { priceSchema } from "@/lib/validation";
import { canRunAction, canEditPrice } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

// AGM / DGM approved selling price. First approval (from SOP_ADDED) transitions
// to PRICE_APPROVED; later revisions (through Live) update the figure and log
// PRICE_REVISED.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    // AGM/DGM approve and revise; GM can override at the final gate.
    const user = await requireRole("AGM_DGM", "GM_SR_GM");
    const { id } = await context.params;
    const { approvedPrice } = priceSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true, costing: { select: { approvedPrice: true } } },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    const isFirstApproval = vehicle.status === "SOP_ADDED";
    if (isFirstApproval) {
      if (!canRunAction(user.role, vehicle.status, "APPROVE_PRICE")) {
        return fail("You cannot approve a price for this vehicle", 403);
      }
    } else if (!canEditPrice(user.role, vehicle.status)) {
      return fail("Price cannot be edited at this stage", 409);
    }

    const previous = vehicle.costing?.approvedPrice ?? null;

    await prisma.$transaction(async (tx) => {
      await tx.costing.upsert({
        where: { vehicleId: id },
        update: { approvedPrice, priceSetById: user.id, priceSetAt: new Date() },
        create: { vehicleId: id, approvedPrice, priceSetById: user.id, priceSetAt: new Date() },
      });

      if (isFirstApproval) {
        await tx.vehicle.update({ where: { id }, data: { status: "PRICE_APPROVED" } });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "PRICE_APPROVED",
          fromStatus: "SOP_ADDED",
          toStatus: "PRICE_APPROVED",
          note: `Price ${taka(approvedPrice)}`,
        });
      } else {
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "PRICE_REVISED",
          field: "approvedPrice",
          oldValue: previous === null ? "—" : taka(previous),
          newValue: taka(approvedPrice),
        });
      }
    });

    return ok({ approvedPrice, transitioned: isFirstApproval });
  },
);

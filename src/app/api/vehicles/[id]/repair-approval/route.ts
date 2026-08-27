import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { repairApprovalSchema } from "@/lib/validation";
import { canRunAction } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

// Service Head desk. Optionally adjusts the engineer's estimate (repair lines,
// transport, other) — logged as an edit — then approves the repair and sets the
// timeframe. `approve:false` saves the adjustment without moving the file.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SERVICE_HEAD");
    const { id } = await context.params;
    const data = repairApprovalSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        costing: { select: { transportCost: true, otherCost: true } },
        repairLines: { select: { amount: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    if (vehicle.status !== "COST_SUBMITTED") {
      return fail("This vehicle is not awaiting repair approval", 409);
    }
    if (data.approve && !canRunAction(user.role, vehicle.status, "APPROVE_REPAIR")) {
      return fail("You cannot approve this repair", 403);
    }

    // Snapshot the current (engineer's) estimate for the audit note.
    const oldRepair = vehicle.repairLines.reduce((s, l) => s + l.amount, 0);
    const oldTransport = vehicle.costing?.transportCost ?? 0;
    const oldOther = vehicle.costing?.otherCost ?? 0;
    const oldTotal = oldRepair + oldTransport + oldOther;

    const result = await prisma.$transaction(async (tx) => {
      if (data.editCosts) {
        if (data.repairLines) {
          await tx.repairCostLine.deleteMany({ where: { vehicleId: id } });
          if (data.repairLines.length > 0) {
            await tx.repairCostLine.createMany({
              data: data.repairLines.map((l) => ({
                vehicleId: id,
                description: l.description,
                amount: l.amount,
                createdById: user.id,
              })),
            });
          }
        }
        const newTransport = data.transportCost ?? oldTransport;
        const newOther = data.otherCost ?? oldOther;
        await tx.costing.upsert({
          where: { vehicleId: id },
          update: { transportCost: newTransport, otherCost: newOther },
          create: { vehicleId: id, transportCost: newTransport, otherCost: newOther },
        });

        const newRepair = data.repairLines
          ? data.repairLines.reduce((s, l) => s + l.amount, 0)
          : oldRepair;
        const newTotal = newRepair + newTransport + newOther;

        if (newTotal !== oldTotal) {
          await recordEvent(tx, {
            vehicleId: id,
            actorId: user.id,
            type: "FIELD_EDITED",
            field: "estimate",
            oldValue: taka(oldTotal),
            newValue: taka(newTotal),
            note: "Service Head adjusted the estimate",
          });
        }
      }

      if (data.approve) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + data.repairDays!);
        deadline.setHours(23, 59, 59, 0);
        await tx.vehicle.update({
          where: { id },
          data: { status: "REPAIR_APPROVED", repairDeadline: deadline },
        });
        await tx.costing.upsert({
          where: { vehicleId: id },
          update: { repairDays: data.repairDays!, repairApprovedById: user.id, repairApprovedAt: new Date() },
          create: { vehicleId: id, repairDays: data.repairDays!, repairApprovedById: user.id, repairApprovedAt: new Date() },
        });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "REPAIR_APPROVED",
          fromStatus: "COST_SUBMITTED",
          toStatus: "REPAIR_APPROVED",
          note: `Repair timeframe ${data.repairDays} day${data.repairDays === 1 ? "" : "s"}`,
        });
      }

      return { approved: data.approve, edited: data.editCosts };
    });

    return ok(result);
  },
);

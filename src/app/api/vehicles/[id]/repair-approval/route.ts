import { ok, fail, withGuard, assertMoved } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { repairApprovalSchema } from "@/lib/validation";
import { canRunAction } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";
import { isPdfName } from "@/lib/photos";
import { taka } from "@/lib/format";

// Service Manager desk. Optionally adjusts the engineer's estimate (repair lines,
// transport, other) — logged as an edit — then takes one of two exits:
//
//   APPROVE  authorise the repair and set the timeframe it runs against.
//   AS IS    decide the vehicle sells in the condition it arrived in.
//
// Both land the file on the Registration desk, because the desks after this
// point do not care which happened. What differs is what the money means: an
// as-is vehicle never spends the estimate, so the estimate stops being a cost
// and becomes the disclosed fault list a buyer is shown.
//
// `approve:false` with no as-is saves an adjustment without moving the file.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SERVICE_HEAD");
    const { id } = await context.params;
    const data = repairApprovalSchema.parse(await request.json());

    for (const name of data.sheetNames) {
      if (!isSafeStoredName(name) || !isPdfName(name)) {
        return fail("The approval sheet must be a PDF", 400);
      }
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        costing: { select: { repairCost: true, transportCost: true, otherCost: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    if (vehicle.status !== "COST_SUBMITTED") {
      return fail("This vehicle is not awaiting repair approval", 409);
    }
    // As-is uses the same authority as approving a repair: it is the same
    // decision — what the workshop does with this vehicle — taken the other way.
    if ((data.approve || data.asIs) && !canRunAction(user.role, vehicle.status, "APPROVE_REPAIR")) {
      return fail("You cannot decide this repair", 403);
    }

    // Snapshot the current (engineer's) estimate for the audit note.
    const oldRepair = vehicle.costing?.repairCost ?? 0;
    const oldTransport = vehicle.costing?.transportCost ?? 0;
    const oldOther = vehicle.costing?.otherCost ?? 0;
    const oldTotal = oldRepair + oldTransport + oldOther;

    const result = await prisma.$transaction(async (tx) => {
      if (data.editCosts) {
        const newRepair = data.repairCost ?? oldRepair;
        const newTransport = data.transportCost ?? oldTransport;
        const newOther = data.otherCost ?? oldOther;
        await tx.costing.upsert({
          where: { vehicleId: id },
          update: { repairCost: newRepair, transportCost: newTransport, otherCost: newOther },
          create: {
            vehicleId: id,
            repairCost: newRepair,
            transportCost: newTransport,
            otherCost: newOther,
          },
        });

        const newTotal = newRepair + newTransport + newOther;

        if (newTotal !== oldTotal) {
          await recordEvent(tx, {
            vehicleId: id,
            actorId: user.id,
            type: "FIELD_EDITED",
            field: "estimate",
            oldValue: taka(oldTotal),
            newValue: taka(newTotal),
            note: "Service Manager adjusted the estimate",
          });
        }
      }

      if (data.approve) {
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + data.repairDays!);
        deadline.setHours(23, 59, 59, 0);
        // Guarded on COST_SUBMITTED, the status this decision was authorised
        // against. Approve and as-is are the same decision taken two ways, so
        // whichever lands first is the one the file carries.
        const moved = await tx.vehicle.updateMany({
          where: { id, status: "COST_SUBMITTED" },
          data: { status: "REPAIR_APPROVED", repairDeadline: deadline },
        });
        assertMoved(moved.count);
        await tx.costing.upsert({
          where: { vehicleId: id },
          update: { repairDays: data.repairDays!, repairApprovedById: user.id, repairApprovedAt: new Date() },
          create: { vehicleId: id, repairDays: data.repairDays!, repairApprovedById: user.id, repairApprovedAt: new Date() },
        });
        await tx.vehiclePhoto.createMany({
          data: data.sheetNames.map((name) => ({
            vehicleId: id,
            slot: "APPROVAL_SHEET" as const,
            url: `/api/files/${name}`,
            uploadedById: user.id,
          })),
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

      if (data.asIs) {
        // No deadline is set, deliberately. A deadline is a promise about work
        // that is going to happen, and none is.
        const moved = await tx.vehicle.updateMany({
          where: { id, status: "COST_SUBMITTED" },
          data: { status: "REPAIR_APPROVED", asIs: true, repairDeadline: null },
        });
        assertMoved(moved.count);
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "SOLD_AS_IS",
          fromStatus: "COST_SUBMITTED",
          toStatus: "REPAIR_APPROVED",
          // The estimate that will now never be spent, on the record, because
          // it is the whole size of the decision.
          oldValue: taka(oldTotal),
          newValue: taka(0),
          note: data.asIsReason,
        });
      }

      return { approved: data.approve, asIs: data.asIs, edited: data.editCosts };
    });

    return ok(result);
  },
);

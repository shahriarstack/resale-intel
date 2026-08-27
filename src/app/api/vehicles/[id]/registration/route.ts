import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { registrationSchema } from "@/lib/validation";
import { canRunAction } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

// Registration Team: itemised registration costs. `submit` runs
// COMPLETE_REGISTRATION → REGISTRATION_DONE. Draft saves keep the file put.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("REGISTRATION_TEAM");
    const { id } = await context.params;
    const data = registrationSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    if (vehicle.status !== "REPAIR_APPROVED") {
      return fail("This vehicle is not awaiting registration costing", 409);
    }
    if (data.submit) {
      if (!canRunAction(user.role, vehicle.status, "COMPLETE_REGISTRATION")) {
        return fail("You cannot complete registration for this vehicle", 403);
      }
      if (data.lines.length === 0) {
        return fail("Add at least one registration cost line before submitting", 422);
      }
    }

    const total = data.lines.reduce((s, l) => s + l.amount, 0);

    await prisma.$transaction(async (tx) => {
      await tx.registrationCostLine.deleteMany({ where: { vehicleId: id } });
      if (data.lines.length > 0) {
        await tx.registrationCostLine.createMany({
          data: data.lines.map((l) => ({
            vehicleId: id,
            description: l.description,
            amount: l.amount,
            createdById: user.id,
          })),
        });
      }
      await tx.costing.upsert({ where: { vehicleId: id }, update: {}, create: { vehicleId: id } });

      if (data.submit) {
        await tx.vehicle.update({ where: { id }, data: { status: "REGISTRATION_DONE" } });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "REGISTRATION_COMPLETED",
          fromStatus: "REPAIR_APPROVED",
          toStatus: "REGISTRATION_DONE",
          note: `Registration cost ${taka(total)}`,
        });
      }
    });

    return ok({ submitted: data.submit });
  },
);

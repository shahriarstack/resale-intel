import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { assessmentSchema } from "@/lib/validation";
import { canRunAction } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";
import { taka } from "@/lib/format";

// Service Engineer cost analysis. Saves repair lines, transport/other cost and
// assessment-sheet photos; `submit` runs SUBMIT_ASSESSMENT → COST_SUBMITTED.
// Draft saves (submit:false) keep the file where it is so work isn't lost.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SERVICE_ENGINEER");
    const { id } = await context.params;
    const data = assessmentSchema.parse(await request.json());

    for (const name of data.newSheetNames) {
      if (!isSafeStoredName(name)) return fail("Invalid sheet reference", 400);
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true, assignedEngineerId: true },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (user.role !== "SUPER_ADMIN" && vehicle.assignedEngineerId !== user.id) {
      return fail("This vehicle is not assigned to you", 403);
    }
    if (vehicle.status !== "CN_APPROVED") {
      return fail("This vehicle is not awaiting assessment", 409);
    }

    // Completeness checks only when submitting for approval.
    if (data.submit) {
      if (!canRunAction(user.role, vehicle.status, "SUBMIT_ASSESSMENT")) {
        return fail("You cannot submit this assessment", 403);
      }
      if (data.repairLines.length === 0) {
        return fail("Add at least one repair cost line before submitting", 422);
      }
      const existingSheets = await prisma.vehiclePhoto.count({
        where: { vehicleId: id, slot: "ASSESSMENT_SHEET", id: { notIn: data.removeSheetIds } },
      });
      if (existingSheets + data.newSheetNames.length === 0) {
        return fail("Upload at least one assessment sheet before submitting", 422);
      }
    }

    const repairTotal = data.repairLines.reduce((s, l) => s + l.amount, 0);

    const result = await prisma.$transaction(async (tx) => {
      // Replace repair lines with the submitted set.
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

      // Transport / other cost on the Costing row.
      await tx.costing.upsert({
        where: { vehicleId: id },
        update: { transportCost: data.transportCost, otherCost: data.otherCost },
        create: { vehicleId: id, transportCost: data.transportCost, otherCost: data.otherCost },
      });

      // Remove any sheets the engineer deleted; add the new ones.
      if (data.removeSheetIds.length > 0) {
        await tx.vehiclePhoto.deleteMany({
          where: { id: { in: data.removeSheetIds }, vehicleId: id, slot: "ASSESSMENT_SHEET" },
        });
      }
      if (data.newSheetNames.length > 0) {
        await tx.vehiclePhoto.createMany({
          data: data.newSheetNames.map((name) => ({
            vehicleId: id,
            slot: "ASSESSMENT_SHEET" as const,
            url: `/api/files/${name}`,
            uploadedById: user.id,
          })),
        });
      }

      if (data.submit) {
        await tx.vehicle.update({ where: { id }, data: { status: "COST_SUBMITTED" } });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "ASSESSMENT_SUBMITTED",
          fromStatus: "CN_APPROVED",
          toStatus: "COST_SUBMITTED",
          note: `Repair estimate ${taka(repairTotal)}`,
        });
      }

      return { submitted: data.submit };
    });

    return ok(result);
  },
);

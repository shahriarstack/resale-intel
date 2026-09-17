import { ok, fail, withGuard, assertMoved } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { assessmentSchema } from "@/lib/validation";
import { canRunAction } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";
import { taka } from "@/lib/format";

/**
 * Service Engineer cost analysis.
 *
 * Saves the quoted repair total, the transport and other costs, and the
 * estimate sheets; `submit` runs SUBMIT_ASSESSMENT → COST_SUBMITTED. Draft
 * saves (submit:false) keep the file where it is so work is not lost.
 *
 * Two things are required to submit, and only two: a repair figure, and at
 * least one estimate sheet backing it. A number with no document behind it is
 * an assertion; the document is what the Service Manager is actually
 * approving against.
 */
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
      const existingSheets = await prisma.vehiclePhoto.count({
        where: { vehicleId: id, slot: "ASSESSMENT_SHEET", id: { notIn: data.removeSheetIds } },
      });
      if (existingSheets + data.newSheetNames.length === 0) {
        return fail("Upload the repair estimate sheet before submitting", 422);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const note = data.repairNote?.trim() || null;

      await tx.costing.upsert({
        where: { vehicleId: id },
        update: {
          repairCost: data.repairCost,
          repairNote: note,
          transportCost: data.transportCost,
          otherCost: data.otherCost,
        },
        create: {
          vehicleId: id,
          repairCost: data.repairCost,
          repairNote: note,
          transportCost: data.transportCost,
          otherCost: data.otherCost,
        },
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
        // Guarded on the status this submission was authorised against, so a
        // resubmitted form cannot move the file a second time.
        const moved = await tx.vehicle.updateMany({
          where: { id, status: "CN_APPROVED" },
          data: { status: "COST_SUBMITTED" },
        });
        assertMoved(moved.count);
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "ASSESSMENT_SUBMITTED",
          fromStatus: "CN_APPROVED",
          toStatus: "COST_SUBMITTED",
          note: `Repair estimate ${taka(data.repairCost)}${note ? ` — ${note}` : ""}`,
        });
      }

      return { submitted: data.submit };
    });

    return ok(result);
  },
);

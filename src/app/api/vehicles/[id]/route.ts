import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { letterUpdateSchema } from "@/lib/validation";
import { canEditCapture, letterLocksRecord } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { letterLabel } from "@/lib/status";

// Read one vehicle with everything the detail view needs.
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireUser();
    const { id } = await context.params;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        capturedBy: { select: { name: true, staffId: true } },
        assignedEngineer: { select: { name: true, staffId: true } },
        territory: { select: { name: true } },
        currentLocation: { select: { name: true } },
        photos: true,
        answers: { include: { question: true } },
        costing: true,
        repairLines: true,
        regLines: true,
        events: {
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    return ok(vehicle);
  },
);

// ARO inline edits: advance the letter stage and/or (re)assign the engineer.
// Advancing to Letter 3 / Written locks the capture record.
export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const input = letterUpdateSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        isLocked: true,
        capturedById: true,
        letterStage: true,
        assignedEngineerId: true,
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (!canEditCapture(user.role, vehicle, user.id)) {
      return fail("This record can no longer be edited", 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: {
        letterStage?: typeof vehicle.letterStage;
        isLocked?: boolean;
        assignedEngineerId?: string;
      } = {};

      if (input.letterStage && input.letterStage !== vehicle.letterStage) {
        data.letterStage = input.letterStage;
        if (letterLocksRecord(input.letterStage)) data.isLocked = true;
      }
      if (input.assignedEngineerId && input.assignedEngineerId !== vehicle.assignedEngineerId) {
        data.assignedEngineerId = input.assignedEngineerId;
      }

      const v = await tx.vehicle.update({
        where: { id },
        data,
        select: { id: true, letterStage: true, isLocked: true, assignedEngineerId: true },
      });

      if (data.letterStage) {
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "LETTER_UPDATED",
          field: "letterStage",
          oldValue: letterLabel(vehicle.letterStage),
          newValue: letterLabel(input.letterStage!),
        });
      }
      if (data.assignedEngineerId) {
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "ENGINEER_ASSIGNED",
          field: "assignedEngineerId",
          newValue: data.assignedEngineerId,
        });
      }

      return v;
    });

    return ok(updated);
  },
);

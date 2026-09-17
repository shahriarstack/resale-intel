import { ok, fail, withGuard } from "@/lib/api";
import { requireStaff, requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { letterUpdateSchema } from "@/lib/validation";
import { canEditCapture, canViewCosts, letterLocksRecord } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { letterLabel } from "@/lib/status";
import { canIssueLetter, dateFieldForStage } from "@/lib/letterSchedule";

// Read one vehicle with everything the detail view needs.
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireStaff();
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

        regLines: true,
        events: {
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    // Gating the render is not enough — the JSON is one fetch away. A role that
    // may not read the cost basis does not receive it.
    //
    // The assigned engineer keeps their own repair lines only WHILE the file is
    // on their bench — their assessment panel is built from them. Once they
    // hand it on, their part is done and the money goes with it: from then on
    // a field role sees the status journey and nothing else.
    if (!canViewCosts(user.role)) {
      const ownsEstimate =
        user.role === "SERVICE_ENGINEER" &&
        vehicle.assignedEngineerId === user.id &&
        vehicle.status === "CN_APPROVED";
      return ok({
        ...vehicle,
        costing: ownsEstimate
          ? {
              transportCost: vehicle.costing?.transportCost ?? 0,
              otherCost: vehicle.costing?.otherCost ?? 0,
            }
          : null,
        repairCost: ownsEstimate ? (vehicle.costing?.repairCost ?? 0) : 0,
        regLines: [],
      });
    }

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
        captureDate: true,
        assignedEngineerId: true,
        letter1At: true,
        letter2At: true,
        letter3At: true,
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (!canEditCapture(user.role, vehicle, user.id)) {
      return fail("This record can no longer be edited", 403);
    }

    // The ladder runs in order and on a clock. Checked here rather than only in
    // the UI: the card offers exactly one rung at a time, but the card is not
    // the authority on what the record permits.
    if (input.letterStage && input.letterStage !== vehicle.letterStage) {
      const gate = canIssueLetter(vehicle, input.letterStage);
      if (!gate.ok) return fail(gate.reason!, 409);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const data: {
        letterStage?: typeof vehicle.letterStage;
        isLocked?: boolean;
        assignedEngineerId?: string;
        letter1At?: Date;
        letter2At?: Date;
        letter3At?: Date;
      } = {};

      if (input.letterStage && input.letterStage !== vehicle.letterStage) {
        data.letterStage = input.letterStage;
        if (letterLocksRecord(input.letterStage)) data.isLocked = true;

        // Stamp the day the letter went out.
        //
        // The schedule that drives every due date downstream is built from
        // these columns, so a stage set without one leaves the next letter
        // with no deadline at all. Written only once per rung: pulling the
        // ladder back to a softer stage and pushing it up again must not
        // rewrite the date the original notice was served, because that date
        // is the one the customer's notice period actually ran from.
        const field = dateFieldForStage(input.letterStage);
        if (field && vehicle[field] === null) data[field] = new Date();
      }
      if (input.assignedEngineerId && input.assignedEngineerId !== vehicle.assignedEngineerId) {
        data.assignedEngineerId = input.assignedEngineerId;
      }

      const v = await tx.vehicle.update({
        where: { id },
        data,
        select: {
          id: true,
          letterStage: true,
          isLocked: true,
          assignedEngineerId: true,
          letter1At: true,
          letter2At: true,
          letter3At: true,
        },
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

import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { transitionSchema } from "@/lib/validation";
import { canRunAction, type Action } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";

// The single status-transition endpoint. Every desk that moves a file without
// attaching extra data (request CN, approve/decline CN, push live, send-backs…)
// posts here. The move is authorised against the RBAC transition table.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const { action, note } = transitionSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true, capturedById: true },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    const transition = canRunAction(user.role, vehicle.status, action as Action);
    if (!transition) {
      return fail("This action is not available for you on this vehicle", 403);
    }

    // Recovery Team may only act on their own captures.
    if (
      user.role === "RECOVERY_TEAM" &&
      vehicle.capturedById !== user.id
    ) {
      return fail("You can only act on vehicles you captured", 403);
    }

    if (transition.requiresNote && !note?.trim()) {
      return fail("A reason is required for this action", 422);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const v = await tx.vehicle.update({
        where: { id },
        data: { status: transition.to },
        select: { id: true, status: true },
      });
      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: transition.event,
        fromStatus: transition.from,
        toStatus: transition.to,
        note: note?.trim() || null,
      });
      return v;
    });

    return ok(updated);
  },
);

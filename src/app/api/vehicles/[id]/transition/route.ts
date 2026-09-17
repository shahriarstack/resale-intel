import { ok, fail, withGuard, assertMoved } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { transitionSchema } from "@/lib/validation";
import { canRunAction, type Action } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { defaultCycleEnd } from "@/lib/resale";
import { canReleaseVehicle } from "@/lib/letterSchedule";

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
      select: {
        id: true,
        status: true,
        capturedById: true,
        letterStage: true,
        letter3At: true,
      },
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

    // Release closes once Letter 3 has gone out.
    //
    // The escalation ladder is a notice period, and once it has run its course
    // the vehicle stops being returnable — the file resolves through a Credit
    // Note. Enforced here rather than only by hiding the button, because the
    // button is not the authority on what the record permits.
    if (action === "RELEASE" && !canReleaseVehicle(vehicle)) {
      return fail(
        "Letter 3 has been issued — this vehicle can no longer be released. Request a Credit Note instead.",
        409,
      );
    }

    if (transition.requiresNote && !note?.trim()) {
      return fail("A reason is required for this action", 422);
    }

    // The write is guarded on the status the transition was authorised
    // against, so a second request that read the same status before either
    // committed moves no row instead of applying the transition twice.
    const updated = await prisma.$transaction(async (tx) => {
      const moved = await tx.vehicle.updateMany({
        where: { id, status: transition.from },
        data: {
          status: transition.to,
          // Reaching the marketplace opens the first pricing month. Set here
          // rather than by a scheduler so a vehicle is never live without a
          // cycle, which would make it permanently un-holdable.
          ...(transition.to === "LIVE_FOR_RESALE"
            ? { resaleCycleEndsAt: defaultCycleEnd() }
            : {}),
        },
      });
      assertMoved(moved.count);

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: transition.event,
        fromStatus: transition.from,
        toStatus: transition.to,
        note: note?.trim() || null,
      });
      return { id, status: transition.to };
    });

    return ok(updated);
  },
);

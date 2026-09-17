import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { repairProgressSchema } from "@/lib/validation";
import { recordEvent } from "@/lib/audit";
import {
  REPAIR_STAGE_META,
  blockedLabel,
  canReportStage,
  stageRefusal,
} from "@/lib/repair";
import type { RepairBlocker, RepairStage } from "@prisma/client";

/** How a report reads in the audit trail — the reason, when there is one. */
function stageEventLabel(stage: RepairStage, blocker: RepairBlocker | null): string {
  return stage === "AWAITING_PARTS"
    ? blockedLabel(blocker)
    : REPAIR_STAGE_META[stage].label;
}
import { HANDOVER_SLOTS, readHandover } from "@/lib/photos";

/**
 * Engineer reports how a live repair is going.
 *
 * This is NOT a workflow transition. It writes advisory fields and an audit
 * row; the vehicle's status is untouched and the state machine never reads
 * what it writes. It follows the same shape as the assessment endpoint, which
 * already saves engineer data without moving the file.
 *
 * Guards mirror the assessment route exactly: Service Engineer role, the file
 * must be assigned to them, and it must be at the one status where a repair is
 * actually live. Reporting progress on a file that has moved on would be
 * writing history that never happened.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SERVICE_ENGINEER");
    const { id } = await context.params;
    const data = repairProgressSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        asIs: true,
        assignedEngineerId: true,
        repairStage: true,
        repairBlocker: true,
        photos: { where: { slot: { in: HANDOVER_SLOTS } }, select: { slot: true, url: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (user.role !== "SUPER_ADMIN" && vehicle.assignedEngineerId !== user.id) {
      return fail("This vehicle is not assigned to you", 403);
    }
    if (vehicle.status !== "REPAIR_APPROVED") {
      return fail("This vehicle does not have a live repair", 409);
    }

    // REPAIR_APPROVED means two different things and only one of them is a
    // repair. On an as-is file the Service Manager authorised no work, so
    // there is no progress to report — the card does not render the control,
    // and the route refuses it, because the control not being drawn is a
    // courtesy to the browser and not a rule.
    if (vehicle.asIs) {
      return fail(
        "This vehicle is being sold as-is — no repair was authorised, so there is no progress to report",
        409,
      );
    }

    // READY is the one stage that is not just a report.
    //
    // It says the vehicle is finished and can be handed on, and everything
    // downstream — the Service Manager's board, the turnaround clock, the
    // listing — takes it at its word. So it is the one stage that has a
    // precondition: the five post-repair photographs. They cannot be collected
    // later, because later the vehicle has left the workshop and whatever it
    // looked like on the day the work finished is gone.
    //
    // The other three stages stay one tap. A gate on "in progress" would only
    // teach people not to file progress at all.
    if (data.stage === "READY") {
      const handover = readHandover(vehicle.photos);
      if (!handover.complete) {
        return fail(
          `Photograph the finished vehicle before marking it ready — ${handover.count} of ${handover.required} done, still needs ${handover.missing.map((a) => a.toLowerCase()).join(", ")}`,
          422,
        );
      }
    }

    // A report only ever goes forward. See `canReportStage` for why the rule
    // is on the STEP rather than on the order of the buttons — in-progress and
    // awaiting-parts share a step, so the part-arrived move stays legal in
    // both directions while nothing can be wound back to "not started".
    //
    // Enforced here and not only in the control: the pills the browser was
    // handed have no authority over what it later posts.
    // The RAW column, not the displayed default.
    //
    // An unreported live repair shows as "in progress" on the control, but
    // nothing has been claimed — the engineer has not filed anything yet — so
    // every stage is still open to them, `NOT_STARTED` included. That report
    // matters: "approved, and I have not been able to start" is precisely what
    // a Service Manager needs to hear early, and ratcheting from the default
    // would refuse the one report the default might be wrong about.
    //
    // The ratchet binds from the first real report onward.
    if (!canReportStage(vehicle.repairStage, data.stage)) {
      return fail(stageRefusal(vehicle.repairStage), 409);
    }

    // Re-reporting the same stage says nothing and would put a meaningless row
    // in the audit trail. A blocked repair is the exception: changing what it
    // is waiting ON — parts, or something else — is a different report even
    // though the stage has not moved.
    const note = data.note?.trim() || null;
    const blockerChanged =
      data.stage === "AWAITING_PARTS" && data.blocker !== vehicle.repairBlocker;
    if (vehicle.repairStage === data.stage && !note && !blockerChanged) {
      return fail("That is already the current stage", 409);
    }

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: {
          repairStage: data.stage,
          repairStageNote: note,
          repairStageAt: now,
          repairStageById: user.id,
          // Cleared the moment the repair moves on. A stale "waiting on parts"
          // left on a finished job is the kind of field that makes a whole
          // board untrustworthy.
          repairBlocker: data.stage === "AWAITING_PARTS" ? data.blocker : null,
        },
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "REPAIR_PROGRESS",
        field: "repairStage",
        oldValue: vehicle.repairStage
          ? stageEventLabel(vehicle.repairStage, vehicle.repairBlocker)
          : "Not reported",
        // The audit trail records WHAT WAS SAID, which for a blocked repair is
        // the reason and not the stage. "Awaiting parts → Awaiting parts" is a
        // row that reads as a mistake; "Waiting on parts → Other issue" is the
        // thing that actually happened.
        newValue: stageEventLabel(data.stage, data.blocker ?? null),
        note,
      });
    });

    return ok({ stage: data.stage, blocker: data.blocker ?? null, note, at: now.toISOString() });
  },
);

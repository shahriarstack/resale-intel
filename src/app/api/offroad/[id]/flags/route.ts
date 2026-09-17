import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { caseFlagSchema } from "@/lib/validation";
import { canRaiseFlag, canViewAllOffroad } from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";
import { FLAG_META } from "@/lib/offroad";

/**
 * Raise a flag on an open case.
 *
 * Two kinds running in opposite directions — the officer asks the desk for
 * something, the desk asks the officer to act — and one endpoint, because they
 * are the same record with the same guard asked from the other side.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const data = caseFlagSchema.parse(await request.json());

    if (!canRaiseFlag(user.role, data.kind)) {
      return fail(
        data.kind === "SUPPORT_REQUEST"
          ? "Only the officer working a case can ask for support on it"
          : "Only Recovery Operations HQ can flag a case for the officer",
        403,
      );
    }

    const kase = await prisma.offroadCase.findUnique({
      where: { id },
      select: { id: true, status: true, openedById: true, registrationNo: true },
    });
    if (!kase) return fail("Case not found", 404);
    if (kase.status !== "OPEN") {
      return fail("This case is closed — there is nothing left to flag", 409);
    }
    // An officer flags their own work; the desk flags anyone's.
    if (!canViewAllOffroad(user.role) && kase.openedById !== user.id) {
      return fail("You can only raise flags on your own cases", 403);
    }

    // One open flag of each kind per case. A second is either a duplicate or an
    // escalation of the first, and both are better served by adding to the
    // existing note than by leaving the recipient two things to close.
    const existing = await prisma.caseFlag.findFirst({
      where: { offroadCaseId: id, kind: data.kind, status: "OPEN" },
      select: { id: true },
    });
    if (existing) {
      return fail(
        data.kind === "SUPPORT_REQUEST"
          ? "There is already an open support request on this case"
          : "This case is already flagged for the officer",
        409,
      );
    }

    const flag = await prisma.$transaction(async (tx) => {
      const row = await tx.caseFlag.create({
        data: { offroadCaseId: id, kind: data.kind, note: data.note, raisedById: user.id },
        select: { id: true, kind: true, status: true, note: true, raisedAt: true },
      });
      await recordRecoveryEvent(tx, {
        offroadCaseId: id,
        actorId: user.id,
        type: "FLAG_RAISED",
        field: data.kind,
        note: `${FLAG_META[data.kind].label}: ${data.note}`,
      });
      return row;
    });

    return ok(flag, 201);
  },
);

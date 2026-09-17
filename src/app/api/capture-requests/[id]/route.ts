import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { captureRequestDecisionSchema } from "@/lib/validation";
import { canDecideCaptureRequest, canWithdrawCaptureRequest } from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";

/**
 * Rule on a capture request — approve, decline, or (for its author) withdraw.
 *
 * Only PENDING requests can be ruled on. A decision already taken is not
 * re-taken: the officer whose request was declined raises a new one with a
 * better case, which keeps both the refusal and the second attempt on record
 * instead of overwriting the first with the second.
 */
export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const { action, note } = captureRequestDecisionSchema.parse(await request.json());

    const row = await prisma.captureRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        registrationNo: true,
        requestedById: true,
      },
    });
    if (!row) return fail("Capture request not found", 404);

    if (row.status !== "PENDING") {
      return fail(
        `This request has already been ${row.status.toLowerCase()} and cannot be changed`,
        409,
      );
    }

    // Two different permissions on one endpoint, because they are two
    // different people acting on the same record: the manager decides, the
    // author withdraws.
    if (action === "WITHDRAW") {
      if (!canWithdrawCaptureRequest(user.role, row.requestedById, user.id)) {
        return fail("You can only withdraw your own capture requests", 403);
      }
    } else if (!canDecideCaptureRequest(user.role)) {
      return fail("Only Recovery Operations HQ can rule on capture requests", 403);
    }

    const status =
      action === "APPROVE" ? "APPROVED" : action === "DECLINE" ? "DECLINED" : "WITHDRAWN";
    const type =
      action === "APPROVE"
        ? "REQUEST_APPROVED"
        : action === "DECLINE"
          ? "REQUEST_DECLINED"
          : "REQUEST_WITHDRAWN";

    await prisma.$transaction(async (tx) => {
      await tx.captureRequest.update({
        where: { id },
        data: {
          status,
          // A withdrawal is the author's act, not a ruling, so it does not
          // fill the decision columns — those record who the DESK was.
          decidedById: action === "WITHDRAW" ? undefined : user.id,
          decidedAt: action === "WITHDRAW" ? undefined : new Date(),
          decisionNote: note?.trim() || null,
        },
      });
      await recordRecoveryEvent(tx, {
        captureRequestId: id,
        actorId: user.id,
        type,
        note: note?.trim() || null,
      });
    });

    return ok({ id, status });
  },
);

/** One request with its full audit trail — the detail view. */
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const row = await prisma.captureRequest.findUnique({
      where: { id },
      include: {
        requestedBy: { select: { name: true, staffId: true } },
        decidedBy: { select: { name: true } },
        territory: { select: { name: true } },
        events: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!row) return fail("Capture request not found", 404);

    // Field officers read their own only. Mirrors the list endpoint rather
    // than relying on the id being unguessable.
    if (
      user.role === "RECOVERY_TEAM" &&
      row.requestedById !== user.id
    ) {
      return fail("Not available for your role", 403);
    }

    return ok(row);
  },
);

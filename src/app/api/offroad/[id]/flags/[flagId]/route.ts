import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { caseFlagResolveSchema } from "@/lib/validation";
import { canClearFlag } from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";
import { FLAG_META } from "@/lib/offroad";

/**
 * Close a flag — answered by the side it was addressed to, or withdrawn by the
 * person who raised it.
 *
 * Both land in RESOLVED rather than in two different terminal states, because
 * every reader of this table is asking the same question: is anyone still
 * waiting on this? Who closed it and what they wrote is what distinguishes an
 * answer from a withdrawal, and both are on the row.
 */
export const PATCH = withGuard(
  async (
    request: Request,
    context: { params: Promise<{ id: string; flagId: string }> },
  ) => {
    const user = await requireUser();
    const { id, flagId } = await context.params;
    const { resolutionNote } = caseFlagResolveSchema.parse(await request.json());

    const flag = await prisma.caseFlag.findUnique({
      where: { id: flagId },
      select: { id: true, kind: true, status: true, raisedById: true, offroadCaseId: true },
    });
    if (!flag || flag.offroadCaseId !== id) return fail("Flag not found", 404);
    if (flag.status !== "OPEN") return fail("This flag is already closed", 409);

    if (!canClearFlag(user.role, flag, user.id)) {
      return fail("You cannot close this flag", 403);
    }

    const withdrawn = flag.raisedById === user.id;

    await prisma.$transaction(async (tx) => {
      await tx.caseFlag.update({
        where: { id: flagId },
        data: {
          status: "RESOLVED",
          resolvedById: user.id,
          resolvedAt: new Date(),
          resolutionNote: resolutionNote?.trim() || null,
        },
      });
      await recordRecoveryEvent(tx, {
        offroadCaseId: id,
        actorId: user.id,
        type: "FLAG_RESOLVED",
        field: flag.kind,
        note: `${FLAG_META[flag.kind].label} ${withdrawn ? "withdrawn" : "closed"}${
          resolutionNote?.trim() ? `: ${resolutionNote.trim()}` : ""
        }`,
      });
    });

    return ok({ id: flagId, status: "RESOLVED", withdrawn });
  },
);

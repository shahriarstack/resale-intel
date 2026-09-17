import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { offroadActionSchema, offroadEditSchema } from "@/lib/validation";
import {
  canResolveOffroadCase,
  canReviseCaseTimeline,
  canViewAllOffroad,
} from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";

/**
 * Act on an open off-road case.
 *
 * Four actions, one endpoint, because on the screen they are one decision:
 * the officer is looking at a case and choosing how it ends (or that it needs
 * longer). Splitting them would have produced four routes loading the same
 * record and repeating the same three guards.
 *
 * CONVERT_TO_CAPTURE is the interesting one, and note what it does NOT do: it
 * does not create a Vehicle. It records the NOC, marks the case converted and
 * hands the officer back to the capture form, which is the only thing in this
 * system allowed to create a capture. A second, thinner vehicle-creation path
 * living here would drift from the real one within a release — different
 * required photos, a missing checklist, no engineer — and every desk
 * downstream would inherit the gap.
 */
export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json();

    const row = await prisma.offroadCase.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        openedById: true,
        approxDays: true,
        revisedDays: true,
        registrationNo: true,
      },
    });
    if (!row) return fail("Case not found", 404);
    if (row.status !== "OPEN") {
      return fail("This case is already closed", 409);
    }

    // An edit carries no `action`; anything with one is a state change.
    if (!("action" in body)) {
      return handleEdit(id, row, body, user);
    }

    const data = offroadActionSchema.parse(body);

    if (data.action === "REVISE_TIMELINE") {
      if (!canReviseCaseTimeline(user.role)) {
        return fail(
          "Only Recovery Operations HQ can revise a case timeline. Add a remark instead.",
          403,
        );
      }
      const revisedDays = data.revisedDays!;
      await prisma.$transaction(async (tx) => {
        await tx.offroadCase.update({
          where: { id },
          data: { revisedDays, revisedById: user.id, revisedAt: new Date() },
        });
        await recordRecoveryEvent(tx, {
          offroadCaseId: id,
          actorId: user.id,
          type: "TIMELINE_REVISED",
          field: "approxDays",
          oldValue: String(row.revisedDays ?? row.approxDays),
          newValue: String(revisedDays),
          note: data.note?.trim() || null,
        });
      });
      return ok({ id, revisedDays });
    }

    // The three closing actions share one guard, and it is narrower than the
    // one above: only the officer who opened the case may declare an outcome.
    // All three are assertions about a physical vehicle — it is back on the
    // road, the thana handed it over, an NOC has been signed — and the desk
    // cannot see any of them from HQ. The desk supervises through the clock
    // and through flags instead.
    if (!canResolveOffroadCase(user.role, row.openedById, user.id)) {
      return fail(
        "Only the officer who opened this case can close it. Raise an attention flag instead.",
        403,
      );
    }

    const status =
      data.action === "MARK_ONROAD"
        ? "RESOLVED_ONROAD"
        : data.action === "RELEASE_TO_CUSTOMER"
          ? "RELEASED_TO_CUSTOMER"
          : "CONVERTED_TO_CAPTURE";

    const type =
      data.action === "MARK_ONROAD"
        ? "MARKED_ONROAD"
        : data.action === "RELEASE_TO_CUSTOMER"
          ? "CASE_RELEASED"
          : "CASE_CONVERTED";

    await prisma.$transaction(async (tx) => {
      await tx.offroadCase.update({
        where: { id },
        data: {
          status,
          resolvedAt: new Date(),
          resolutionNote: data.note?.trim() || null,
          nocReference:
            data.action === "CONVERT_TO_CAPTURE" ? data.nocReference!.trim() : undefined,
        },
      });
      await recordRecoveryEvent(tx, {
        offroadCaseId: id,
        actorId: user.id,
        type,
        note:
          data.action === "CONVERT_TO_CAPTURE"
            ? `NOC ${data.nocReference!.trim()}${data.note?.trim() ? ` · ${data.note.trim()}` : ""}`
            : data.note?.trim() || null,
      });
    });

    return ok({
      id,
      status,
      // The client uses this to route straight into the pre-filled capture
      // form; every other outcome ends on the list.
      nextStep: data.action === "CONVERT_TO_CAPTURE" ? `/capture?caseId=${id}` : null,
    });
  },
);

/**
 * Revise the descriptive fields of an open case.
 *
 * Deliberately excludes `approxDays` — the clock moves only through
 * REVISE_TIMELINE, which is guarded by a different permission and writes the
 * revision columns rather than overwriting the field estimate.
 */
async function handleEdit(
  id: string,
  row: { openedById: string; kind: string },
  body: unknown,
  user: { id: string; role: import("@prisma/client").Role },
) {
  if (!canResolveOffroadCase(user.role, row.openedById, user.id)) {
    return fail("You can only edit cases you opened", 403);
  }
  const data = offroadEditSchema.parse(body);

  // `approxDays` is dropped rather than destructured away: the clock moves only
  // through REVISE_TIMELINE, which carries a different permission and writes
  // the revision columns instead of overwriting the field estimate.
  const changed = Object.fromEntries(
    Object.entries(data).filter(([k, v]) => k !== "approxDays" && v !== undefined),
  );
  if (Object.keys(changed).length === 0) return ok({ id, changed: 0 });

  await prisma.$transaction(async (tx) => {
    await tx.offroadCase.update({ where: { id }, data: changed });
    await recordRecoveryEvent(tx, {
      offroadCaseId: id,
      actorId: user.id,
      type: "CASE_EDITED",
      note: `Updated: ${Object.keys(changed).join(", ")}`,
    });
  });

  return ok({ id, changed: Object.keys(changed).length });
}

/** One case with photos and its full trail. */
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const row = await prisma.offroadCase.findUnique({
      where: { id },
      include: {
        openedBy: { select: { name: true, staffId: true } },
        revisedBy: { select: { name: true } },
        territory: { select: { name: true } },
        photos: { select: { id: true, url: true, caption: true } },
        events: {
          orderBy: { createdAt: "asc" },
          include: { actor: { select: { name: true } } },
        },
      },
    });
    if (!row) return fail("Case not found", 404);

    if (!canViewAllOffroad(user.role) && row.openedById !== user.id) {
      return fail("Not available for your role", 403);
    }

    return ok(row);
  },
);

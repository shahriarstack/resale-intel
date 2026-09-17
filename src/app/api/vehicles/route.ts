import type { Prisma, VehicleStatus } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole, requireStaff } from "@/lib/session";
import { territoryDenied } from "@/lib/postings";
import { prisma } from "@/lib/prisma";
import { captureSchema } from "@/lib/validation";
import { recordEvent, recordRecoveryEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";
import { shortDate, taka } from "@/lib/format";
import { resolveBrandModel } from "@/lib/masterData";
import { intakeSourceForKind } from "@/lib/offroad";
import { findAuthorisingWindow } from "@/lib/captureWindow";
import { STATUS_META } from "@/lib/status";

// Create a capture. Recovery Team (or Super Admin) only. Records the CAPTURED
// audit event and an empty Costing row in the same transaction.
export const POST = withGuard(async (request: Request) => {
  const user = await requireRole("RECOVERY_TEAM");
  const body = await request.json();
  const data = captureSchema.parse(body);

  // The form only offers this officer their own patches, which is a courtesy
  // to whoever is filling it in and not a control — the list a browser was
  // handed has no authority over what it posts. This is where the rule holds.
  const denied = territoryDenied(user.role, user.territoryIds, data.territoryId);
  if (denied) return fail(denied, 403);

  // Every photo must reference a name we actually stored.
  for (const p of data.photos) {
    if (!isSafeStoredName(p.name)) return fail("Invalid photo reference", 400);
  }

  // Resolve the picked brand/model to the text stored on the vehicle. Done
  // server-side so the pick list is enforced, not merely offered.
  const picked = await resolveBrandModel(data.brandId, data.modelId);
  if ("error" in picked) return fail(picked.error, 400);

  // ---- Provenance -------------------------------------------------------
  //
  // A capture is not a thing an officer decides on their own. It comes from
  // ONE of two places and never from nowhere:
  //
  //   an APPROVED capture request — the manager ruled on the account position
  //   before the vehicle was touched; or
  //
  //   a CONVERTED off-road case — an accident or seizure that stopped being
  //   returnable, with an NOC reference on record.
  //
  // Refusing a bare capture is the whole point of the pre-approval gate. If the
  // form could still create one, the gate would be a suggestion.
  //
  // A capture may be made against an approved request, or out of an off-road
  // case that stopped being returnable. Both are verified here rather than
  // trusted from the payload: the record must exist, belong to this officer,
  // and still be in a state that can be consumed. An approval already spent on
  // a different vehicle must not authorise a second seizure.
  let intakeSource:
    | "DIRECT_CAPTURE"
    | "APPROVED_REQUEST"
    | "FROM_ACCIDENT"
    | "FROM_THANA"
    | "BACKFILL_CAPTURE" = "DIRECT_CAPTURE";
  // Set only on the backfill path, and written onto the vehicle so the
  // authorisation stays attached to the record it authorised.
  let captureWindowId: string | null = null;
  let backfill: { reason: string; openedByName: string } | null = null;
  const requestId = data.captureRequestId?.trim() || null;
  const caseId = data.offroadCaseId?.trim() || null;

  if (!requestId && !caseId) {
    // The third door, and the only one an admin can open: a direct-capture
    // window. See lib/captureWindow.ts and the CaptureWindow model.
    //
    // Re-checked here rather than trusted from the client, and re-checked at
    // submit rather than only when the form was opened — a window can expire or
    // be revoked while an officer is filling the form in, and the authorisation
    // that matters is the one in force when the record is written.
    const win = await findAuthorisingWindow(prisma, user);
    if (!win) {
      return fail(
        "A capture needs an approved capture request, or an off-road case converted to one. Raise a request first.",
        422,
      );
    }
    intakeSource = "BACKFILL_CAPTURE";
    captureWindowId = win.id;
    backfill = { reason: win.reason, openedByName: win.openedByName };
  }

  if (requestId) {
    const req = await prisma.captureRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true, requestedById: true, registrationNo: true },
    });
    if (!req) return fail("That capture request no longer exists", 404);
    if (req.status !== "APPROVED") {
      return fail("Only an approved capture request can be captured against", 409);
    }
    if (user.role === "RECOVERY_TEAM" && req.requestedById !== user.id) {
      return fail("You can only capture against your own approved requests", 403);
    }
    intakeSource = "APPROVED_REQUEST";
  }

  if (caseId) {
    const kase = await prisma.offroadCase.findUnique({
      where: { id: caseId },
      select: { id: true, kind: true, status: true, openedById: true, vehicleId: true },
    });
    if (!kase) return fail("That off-road case no longer exists", 404);
    // The case is marked CONVERTED_TO_CAPTURE by the convert action BEFORE the
    // officer reaches this form, so that is the state we expect to find it in.
    if (kase.status !== "CONVERTED_TO_CAPTURE") {
      return fail("Convert the off-road case to a capture before recording it", 409);
    }
    if (kase.vehicleId) {
      return fail("That case has already been captured", 409);
    }
    intakeSource = intakeSourceForKind(kase.kind);
  }

  // Every capture starts at NONE.
  //
  // The form used to offer a letter stage, which let an officer record a
  // vehicle as already at Letter 2 on the day it was seized — collapsing a
  // fifteen-day notice period into one dropdown. The ladder is stepped through
  // afterwards, one rung at a time, and `canIssueLetter` holds the spacing.
  const locked = false;

  // Every active question must be answered. The schema can only see the
  // answers that were sent; only the database knows how many were asked, so
  // this is the check that makes "all fields required" true for a payload that
  // did not come from our own form.
  const asked = await prisma.documentQuestion.findMany({
    where: { isActive: true },
    select: { id: true, label: true },
  });
  const answered = new Set(data.answers.map((a) => a.questionId));
  const unanswered = asked.filter((q) => !answered.has(q.id));
  if (unanswered.length > 0) {
    return fail(
      `Answer every document question: ${unanswered.map((q) => q.label).join(", ")}`,
      422,
    );
  }

  const vehicle = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        registrationNo: data.registrationNo,
        customerName: data.customerName,
        customerCode: emptyToNull(data.customerCode),
        make: picked.make,
        model: picked.model,
        mileage: emptyToNull(data.mileage),
        condition: data.condition,
        territoryId: data.territoryId,
        // Exactly one of these is set; the schema has already rejected both
        // and neither.
        currentLocationId: emptyToNull(data.currentLocationId),
        currentLocationOther: emptyToNull(data.currentLocationOther),
        captureDate: data.captureDate ?? new Date(),
        remarks: emptyToNull(data.remarks),
        hasSleeperCabin: data.hasSleeperCabin,
        // The fine is only stored when a slip was actually raised, so an
        // amount left behind by a toggled-off checkbox cannot leak into the
        // record. The schema has already rejected a slip with no amount.
        hasCaseSlip: data.hasCaseSlip,
        caseSlipFine: data.hasCaseSlip ? (data.caseSlipFine ?? null) : null,
        // Field spend, kept for the Recovery Manager. Never read by costing.
        captureCost: data.captureCost ?? null,
        // Always NONE — see above. The three letter dates stay null until each
        // notice is actually served.
        letterStage: "NONE",
        isLocked: locked,
        intakeSource,
        captureWindowId,
        status: "CAPTURED",
        capturedById: user.id,
        assignedEngineerId: data.assignedEngineerId,
        costing: { create: {} },
        photos: {
          create: data.photos.map((p) => ({
            slot: p.slot,
            url: `/api/files/${p.name}`,
            uploadedById: user.id,
          })),
        },
        answers: {
          create: data.answers.map((a) => ({
            questionId: a.questionId,
            answer: a.answer,
            note: emptyToNull(a.note),
          })),
        },
      },
      select: { id: true, registrationNo: true },
    });

    await recordEvent(tx, {
      vehicleId: created.id,
      actorId: user.id,
      type: "CAPTURED",
      toStatus: "CAPTURED",
      note: captureNote(
        data.hasCaseSlip,
        data.caseSlipFine ?? null,
        backfill,
        // Only worth saying when the officer actually chose a past date. A
        // capture recorded on the day it happened is the norm and needs no
        // annotation; one dated three weeks back is a fact about the record.
        data.captureDate && !isToday(data.captureDate) ? data.captureDate : null,
      ),
    });

    // Close the origin record against the vehicle it produced, in the same
    // transaction. An approval that is spent but still reads APPROVED would
    // authorise a second seizure; a converted case with no vehicle pointer is
    // a dead end for anyone tracing where a file came from.
    if (requestId) {
      await tx.captureRequest.update({
        where: { id: requestId },
        data: { status: "CAPTURED", vehicleId: created.id },
      });
      await recordRecoveryEvent(tx, {
        captureRequestId: requestId,
        actorId: user.id,
        type: "REQUEST_CAPTURED",
        note: `Captured as ${created.registrationNo}`,
      });
    }
    if (caseId) {
      await tx.offroadCase.update({
        where: { id: caseId },
        data: { vehicleId: created.id },
      });
    }

    return created;
  });

  return ok(vehicle, 201);
});

// List vehicles, scoped by role. Field roles see only their own files.
export const GET = withGuard(async (request: Request) => {
  const user = await requireStaff();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();

  const where: Prisma.VehicleWhereInput = {};
  if (user.role === "RECOVERY_TEAM") where.capturedById = user.id;
  else if (user.role === "SERVICE_ENGINEER") where.assignedEngineerId = user.id;

  // Checked against the status list rather than cast into the query.
  //
  // The cast that used to be here handed an arbitrary query string to Prisma,
  // which rejects it with a PrismaClientValidationError — and that is not one
  // of the three error types `withGuard` knows, so a mistyped status in a URL
  // came back as a 500 and a stack trace in the log. The caller's fault
  // deserves the caller's status code.
  //
  // Checked against STATUS_META rather than a list written out here: it is a
  // `Record<VehicleStatus, …>`, so the compiler refuses it if a status is ever
  // added to the enum and not to the map. A hand-written array would go stale
  // silently and start rejecting a status the product had just gained.
  if (status) {
    if (!Object.hasOwn(STATUS_META, status)) {
      return fail(`Unknown status: ${status}`, 400);
    }
    where.status = status as VehicleStatus;
  }

  // Optional free-text search, used by the command palette. Additive: with no
  // `q` the response is byte-for-byte what it was before. Role scoping above
  // still applies, so search can never widen what a user is allowed to see.
  if (q) {
    where.OR = [
      { registrationNo: { contains: q } },
      { customerName: { contains: q } },
      { make: { contains: q } },
      { model: { contains: q } },
    ];
  }

  const vehicles = await prisma.vehicle.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      capturedBy: { select: { name: true } },
      assignedEngineer: { select: { name: true, staffId: true } },
      territory: { select: { name: true } },
    },
  });

  return ok(vehicles);
});

/**
 * What the CAPTURED audit row records beyond the status change.
 *
 * A case slip is a liability attached at capture, so it belongs in the trail
 * from the first event rather than only in a column someone has to go looking
 * for.
 */
/**
 * The note on the CAPTURED event.
 *
 * Two facts, either of which may be absent. The backfill line comes first
 * because it is the one that changes how the rest of the record should be
 * read: this vehicle did not pass the approval gate, and anybody reading the
 * timeline should learn that before they learn about the fine.
 */
function captureNote(
  hasCaseSlip: boolean,
  fine: number | null,
  backfill: { reason: string; openedByName: string } | null,
  backdatedTo: Date | null,
): string | null {
  const parts: string[] = [];
  if (backfill) {
    parts.push(
      `Entered under a direct-capture window opened by ${backfill.openedByName} — no capture request. Reason: ${backfill.reason}`,
    );
  }
  if (backdatedTo) parts.push(`Backdated to ${shortDate(backdatedTo)}`);
  if (hasCaseSlip) parts.push(`Case slip fine ${taka(fine ?? 0)}`);
  return parts.length ? parts.join(" · ") : null;
}

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/** Whether a date falls on the current local day. */
function isToday(d: Date): boolean {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

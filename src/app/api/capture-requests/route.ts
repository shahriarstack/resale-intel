import type { Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { territoryDenied } from "@/lib/postings";
import { captureRequestSchema } from "@/lib/validation";
import { canRequestCapture, canViewOffroad, canViewAllOffroad } from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";
import { resolveBrandModel, emptyToNull } from "@/lib/masterData";
import { taka } from "@/lib/format";

/**
 * Raise a pre-approval request to capture a vehicle.
 *
 * The vehicle is still on the road at this point, so nothing here touches the
 * Vehicle table. That only happens later, if the request is approved and the
 * officer completes the capture form against it.
 */
export const POST = withGuard(async (request: Request) => {
  const user = await requireUser();
  if (!canRequestCapture(user.role)) {
    return fail("You do not have access to raise capture requests", 403);
  }

  const data = captureRequestSchema.parse(await request.json());

  const picked = await resolveBrandModel(data.brandId, data.modelId);
  if ("error" in picked) return fail(picked.error, 400);

  // One live request per vehicle. A second pending request on a registration
  // that already has one is nearly always a duplicate raised because the first
  // was not visible — and two managers approving the same seizure separately
  // is the failure this whole gate exists to prevent.
  const live = await prisma.captureRequest.findFirst({
    where: {
      registrationNo: data.registrationNo,
      status: { in: ["PENDING", "APPROVED"] },
    },
    select: { id: true, status: true },
  });
  if (live) {
    return fail(
      live.status === "PENDING"
        ? "There is already a capture request awaiting approval for this vehicle"
        : "This vehicle already has an approved capture request — complete the capture instead",
      409,
    );
  }

// The form only offers this officer their own patches, which is a courtesy
  // to whoever is filling it in and not a control — the list a browser was
  // handed has no authority over what it posts. This is where the rule holds.
  const denied = territoryDenied(user.role, user.territoryIds, emptyToNull(data.territoryId));
  if (denied) return fail(denied, 403);

  // A vehicle already in the pipeline cannot be requested again. Released and
  // sold files are excluded: a re-recovered vehicle is a legitimate new
  // request, and refusing it would leave the officer no way to record one.
  const inPipeline = await prisma.vehicle.findUnique({
    where: { registrationNo: data.registrationNo },
    select: { status: true },
  });
  if (inPipeline && inPipeline.status !== "RELEASED" && inPipeline.status !== "SOLD") {
    return fail("This vehicle is already in the pipeline", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.captureRequest.create({
      data: {
        registrationNo: data.registrationNo,
        customerCode: data.customerCode,
        customerName: data.customerName,
        make: picked.make,
        model: picked.model,
        odNumber: data.odNumber,
        odAmount: data.odAmount,
        outstandingAmount: data.outstandingAmount,
        settlementPossible: data.settlementPossible,
        remarks: data.remarks,
        // Falls back to the territory the officer is BASED in, not merely one
        // they hold. An officer covering a vacant patch is helping out there;
        // the request they raise without naming a territory is a request on
        // their own.
        territoryId: emptyToNull(data.territoryId) ?? user.baseTerritoryId,
        requestedById: user.id,
        status: "PENDING",
      },
      select: { id: true, registrationNo: true, status: true },
    });

    await recordRecoveryEvent(tx, {
      captureRequestId: row.id,
      actorId: user.id,
      type: "REQUEST_SUBMITTED",
      note: `OD ${data.odNumber} · ${taka(data.odAmount)} overdue · ${taka(
        data.outstandingAmount,
      )} outstanding · expects ${
        data.settlementPossible ? "settlement after capture" : "no settlement, resale"
      }`,
    });

    return row;
  });

  return ok(created, 201);
});

/**
 * List capture requests, scoped by role.
 *
 * An ARO reads their own; the manager and admin read the organisation's. The
 * scoping is applied here rather than by the caller so a hand-rolled request
 * cannot widen it.
 */
export const GET = withGuard(async (request: Request) => {
  const user = await requireUser();
  if (!canViewOffroad(user.role)) return fail("Not available for your role", 403);

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");

  const where: Prisma.CaptureRequestWhereInput = {};
  if (!canViewAllOffroad(user.role)) where.requestedById = user.id;
  if (status) {
    where.status = status as Prisma.CaptureRequestWhereInput["status"];
  }

  const rows = await prisma.captureRequest.findMany({
    where,
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      registrationNo: true,
      customerCode: true,
      customerName: true,
      make: true,
      model: true,
      odNumber: true,
      odAmount: true,
      outstandingAmount: true,
      settlementPossible: true,
      remarks: true,
      status: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
      vehicleId: true,
      requestedBy: { select: { name: true, staffId: true } },
      decidedBy: { select: { name: true } },
      territory: { select: { name: true } },
    },
  });

  return ok(rows);
});

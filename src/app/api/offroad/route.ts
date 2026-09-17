import type { Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { territoryDenied } from "@/lib/postings";
import { offroadCaseSchema } from "@/lib/validation";
import { canOpenOffroadCase, canViewOffroad, canViewAllOffroad } from "@/lib/rbac";
import { recordRecoveryEvent } from "@/lib/audit";
import { resolveBrandModel, emptyToNull } from "@/lib/masterData";
import { isSafeStoredName } from "@/lib/storage";
import { OFFROAD_KIND_META } from "@/lib/offroad";

/**
 * Open an accident or police-custody case.
 *
 * Nothing here creates a Vehicle. That is the whole architectural point: a
 * vehicle that is damaged or impounded is not company stock and mostly never
 * will be, so it gets a case record and a countdown rather than a place in the
 * eight-desk chain. Conversion — the minority path — is a separate, deliberate
 * action on an open case.
 */
export const POST = withGuard(async (request: Request) => {
  const user = await requireUser();
  if (!canOpenOffroadCase(user.role)) {
    return fail("You do not have access to open off-road cases", 403);
  }

  const data = offroadCaseSchema.parse(await request.json());

  for (const p of data.photos) {
    if (!isSafeStoredName(p.name)) return fail("Invalid photo reference", 400);
  }

  const picked = await resolveBrandModel(data.brandId, data.modelId);
  if ("error" in picked) return fail(picked.error, 400);

  // A vehicle is off the road for one reason at a time. An open case on the
  // same registration means either a duplicate entry or a change of
  // circumstances that should be recorded on the existing case, not beside it.
  const openCase = await prisma.offroadCase.findFirst({
    where: { registrationNo: data.registrationNo, status: "OPEN" },
    select: { id: true, kind: true },
  });
  if (openCase) {
    return fail(
      `This vehicle already has an open ${OFFROAD_KIND_META[openCase.kind].label} case`,
      409,
    );
  }

// The form only offers this officer their own patches, which is a courtesy
  // to whoever is filling it in and not a control — the list a browser was
  // handed has no authority over what it posts. This is where the rule holds.
  const denied = territoryDenied(user.role, user.territoryIds, emptyToNull(data.territoryId));
  if (denied) return fail(denied, 403);

  // Nor can it be off the road and in the resale pipeline at once.
  const inPipeline = await prisma.vehicle.findUnique({
    where: { registrationNo: data.registrationNo },
    select: { status: true },
  });
  if (inPipeline && inPipeline.status !== "RELEASED" && inPipeline.status !== "SOLD") {
    return fail("This vehicle is already captured and in the resale pipeline", 409);
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.offroadCase.create({
      data: {
        kind: data.kind,
        status: "OPEN",
        registrationNo: data.registrationNo,
        customerCode: data.customerCode,
        customerName: data.customerName,
        make: picked.make,
        model: picked.model,
        mileage: data.mileage,
        occurredAt: data.occurredAt,
        approxDays: data.approxDays,
        remarks: data.remarks,
        territoryId: emptyToNull(data.territoryId) ?? user.baseTerritoryId,
        openedById: user.id,

        // The account position, where the officer had it. `?? null` rather
        // than leaving it undefined so "not answered" is stored as an explicit
        // gap the desk can see, not as a field that silently never existed.
        odNumber: data.odNumber ?? null,
        odAmount: data.odAmount ?? null,
        outstandingAmount: data.outstandingAmount ?? null,

        // Kind-specific columns. The discriminated union has already
        // guaranteed that only one branch's fields are present, so the other
        // branch's columns are simply left null rather than defended against.
        ...(data.kind === "ACCIDENT"
          ? {
              accidentSeverity: data.accidentSeverity,
              accidentNote: data.accidentNote,
            }
          : {
              vehicleCondition: data.vehicleCondition,
              thanaReason: data.thanaReason,
              thanaReasonNote: emptyToNull(data.thanaReasonNote),
              thanaName: data.thanaName,
              vehicleLocation: data.vehicleLocation,
            }),

        photos: {
          create: data.photos.map((p) => ({
            url: `/api/files/${p.name}`,
            caption: emptyToNull(p.caption),
            uploadedById: user.id,
          })),
        },
      },
      select: { id: true, kind: true, registrationNo: true },
    });

    await recordRecoveryEvent(tx, {
      offroadCaseId: row.id,
      actorId: user.id,
      type: "CASE_OPENED",
      note:
        data.kind === "ACCIDENT"
          ? `${data.accidentSeverity} · ${data.approxDays} day repair estimate`
          : `${data.thanaReason} · ${data.thanaName} · ${data.approxDays} day estimate`,
    });

    return row;
  });

  return ok(created, 201);
});

/**
 * List off-road cases, scoped by role and filtered by kind/status.
 *
 * The default is OPEN cases only. A closed case is history — useful on a
 * detail view and in the admin roll-up, never what someone opening the board
 * wants to look at first.
 */
export const GET = withGuard(async (request: Request) => {
  const user = await requireUser();
  if (!canViewOffroad(user.role)) return fail("Not available for your role", 403);

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const status = searchParams.get("status");

  const where: Prisma.OffroadCaseWhereInput = {};
  if (!canViewAllOffroad(user.role)) where.openedById = user.id;
  if (kind) where.kind = kind as Prisma.OffroadCaseWhereInput["kind"];
  if (status === "all") {
    /* every state */
  } else if (status) {
    where.status = status as Prisma.OffroadCaseWhereInput["status"];
  } else {
    where.status = "OPEN";
  }

  const rows = await prisma.offroadCase.findMany({
    where,
    // Oldest first: a case that has been open longest is the one closest to
    // breaching its window, which is what the board is for.
    orderBy: [{ status: "asc" }, { occurredAt: "asc" }],
    take: 300,
    include: {
      openedBy: { select: { name: true, staffId: true } },
      revisedBy: { select: { name: true } },
      territory: { select: { name: true } },
      photos: { select: { id: true, url: true, caption: true } },
    },
  });

  return ok(rows);
});

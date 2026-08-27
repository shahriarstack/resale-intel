import type { Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole, requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { captureSchema } from "@/lib/validation";
import { letterLocksRecord } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";

// Create a capture. Recovery Team (or Super Admin) only. Records the CAPTURED
// audit event and an empty Costing row in the same transaction.
export const POST = withGuard(async (request: Request) => {
  const user = await requireRole("RECOVERY_TEAM");
  const body = await request.json();
  const data = captureSchema.parse(body);

  // Every photo must reference a name we actually stored.
  for (const p of data.photos) {
    if (!isSafeStoredName(p.name)) return fail("Invalid photo reference", 400);
  }

  const locked = letterLocksRecord(data.letterStage);

  const vehicle = await prisma.$transaction(async (tx) => {
    const created = await tx.vehicle.create({
      data: {
        registrationNo: data.registrationNo,
        customerName: data.customerName,
        customerCode: emptyToNull(data.customerCode),
        make: emptyToNull(data.make),
        model: emptyToNull(data.model),
        year: data.year ?? null,
        mileage: emptyToNull(data.mileage),
        territoryId: data.territoryId,
        currentLocationId: data.currentLocationId,
        capturedLocation: emptyToNull(data.capturedLocation),
        captureDate: data.captureDate ?? new Date(),
        remarks: emptyToNull(data.remarks),
        hasSleeperCabin: data.hasSleeperCabin,
        letterStage: data.letterStage,
        isLocked: locked,
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
      note: data.letterStage !== "NONE" ? `Captured at ${data.letterStage}` : null,
    });

    return created;
  });

  return ok(vehicle, 201);
});

// List vehicles, scoped by role. Field roles see only their own files.
export const GET = withGuard(async (request: Request) => {
  const user = await requireUser();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q")?.trim();

  const where: Prisma.VehicleWhereInput = {};
  if (user.role === "RECOVERY_TEAM") where.capturedById = user.id;
  else if (user.role === "SERVICE_ENGINEER") where.assignedEngineerId = user.id;
  if (status) where.status = status as Prisma.VehicleWhereInput["status"];

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

function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

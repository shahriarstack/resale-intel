import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { handoverSchema } from "@/lib/validation";
import { recordEvent } from "@/lib/audit";
import { isSafeStoredName } from "@/lib/storage";
import { HANDOVER_OF, HANDOVER_SLOTS, readHandover, type Angle } from "@/lib/photos";

/**
 * The engineer's handover set.
 *
 * Five photographs, one per angle, taken once the repair is done. They are the
 * pictures the vehicle is later SOLD from, which is the reason this endpoint
 * exists at all rather than the shots being an optional extra on the progress
 * report: a listing photographed before the work shows a buyer a wreck we have
 * already repaired, and no amount of description text undoes that.
 *
 * Saves are per angle and idempotent. An angle sent twice replaces itself, so
 * a bad shot is retaken rather than lived with, and a phone that loses signal
 * half way through five uploads resumes instead of starting again.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SERVICE_ENGINEER");
    const { id } = await context.params;
    const data = handoverSchema.parse(await request.json());

    for (const shot of data.shots) {
      if (!isSafeStoredName(shot.name)) {
        return fail("Invalid photo reference", 400);
      }
    }

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        asIs: true,
        assignedEngineerId: true,
        photos: { where: { slot: { in: HANDOVER_SLOTS } }, select: { slot: true, url: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (user.role !== "SUPER_ADMIN" && vehicle.assignedEngineerId !== user.id) {
      return fail("This vehicle is not assigned to you", 403);
    }
    // Same window as the progress report: only while a repair is actually live.
    // Photographs filed after the file has moved on would be a record of a
    // vehicle in a state nobody authorised anyone to change it into.
    if (vehicle.status !== "REPAIR_APPROVED") {
      return fail("This vehicle does not have a live repair", 409);
    }
    if (vehicle.asIs) {
      return fail("This vehicle is being sold as is — there is no repair to photograph", 409);
    }

    const wasComplete = readHandover(vehicle.photos).complete;

    const result = await prisma.$transaction(async (tx) => {
      const touched: Angle[] = [
        ...data.remove,
        ...data.shots.map((s) => s.angle),
      ];
      if (touched.length > 0) {
        await tx.vehiclePhoto.deleteMany({
          where: { vehicleId: id, slot: { in: touched.map((a) => HANDOVER_OF[a]) } },
        });
      }
      if (data.shots.length > 0) {
        await tx.vehiclePhoto.createMany({
          data: data.shots.map((s) => ({
            vehicleId: id,
            slot: HANDOVER_OF[s.angle],
            url: `/api/files/${s.name}`,
            uploadedById: user.id,
          })),
        });
      }

      const after = await tx.vehiclePhoto.findMany({
        where: { vehicleId: id, slot: { in: HANDOVER_SLOTS } },
        select: { slot: true, url: true },
      });
      const state = readHandover(after);

      // Recorded the first time the set closes, not on every save. Five
      // separate "photo uploaded" rows would bury the journey timeline in
      // events nobody reads; one row saying the vehicle has been photographed
      // for sale is the fact worth keeping.
      if (state.complete && !wasComplete) {
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "HANDOVER_SUBMITTED",
          note: "Five post-repair photographs filed — the vehicle can be listed from these",
        });
      }

      return state;
    });

    return ok(result);
  },
);

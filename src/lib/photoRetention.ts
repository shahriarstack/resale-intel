import fs from "node:fs/promises";
import type { PhotoSlot } from "@prisma/client";
import { prisma } from "./prisma";
import { recordEvent } from "./audit";
import { resolveStoredPath } from "./storage";

/**
 * Post-sale photo retention.
 *
 * A sold vehicle's photographs stop being evidence the day the sale closes.
 * They were taken to prove what was seized and what was repaired — questions
 * that are settled once somebody has bought the thing and driven it away. What
 * stays useful is the FILE: what it cost, what it fetched, who moved it
 * through which desk. So the images go and the record does not.
 *
 * Seven days after the sale, not on the day of it. A sale is the one moment a
 * dispute is most likely — a buyer who finds something, a desk that queries a
 * figure — and deleting the photographs the instant the award lands would
 * destroy the evidence exactly when it is most likely to be wanted. A week is
 * the window in which that argument happens.
 *
 * WHAT IS DELETED, precisely:
 *
 *   gone    photographs OF THE VEHICLE — the capture set and the handover set
 *           — as rows and as files on disk
 *   kept    every document slot: the repair estimate, the approval sheet, the
 *           registration paperwork, the signed capture form, the photographed
 *           remarks
 *   kept    the Vehicle, its Costing, its registration and repair lines, its
 *           bids, and every VehicleEvent ever written against it
 *   added   one PHOTOS_PURGED event per vehicle, recording how many images
 *           there were and when they went
 *
 * The document slots stay because they are not pictures of a truck, they are
 * the evidence behind figures and authorities that remain on the file for
 * ever. The repair cost is quoted against the estimate sheet; the seizure
 * rests on the signed capture form. Deleting those while keeping the numbers
 * they justify would leave a record asserting amounts nothing supports — which
 * is a worse record than one carrying photographs nobody needs.
 *
 * The event matters for the same reason. A deletion with no trace is
 * indistinguishable from a vehicle that was never photographed, and those are
 * very different records.
 *
 * The files are deleted from disk as well as the rows. Deleting only the rows
 * would leave the images on the server for ever with nothing pointing at them
 * — the bytes retained and the record of them lost, which is the worst of both
 * halves. This is irreversible; it is meant to be.
 */

export const RETENTION_DAYS = 7;

const DAY_MS = 86_400_000;

/** Sold on or before this instant, and the photographs are due. */
export function retentionCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - RETENTION_DAYS * DAY_MS);
}

export interface PurgeResult {
  vehicles: number;
  photos: number;
  /** Image files actually unlinked. */
  filesRemoved: number;
  /** Rows whose file was already gone — counted rather than treated as an
   *  error, because a re-run over a half-finished sweep is a normal event. */
  filesMissing: number;
}

export interface PurgePending {
  /** Vehicles whose photographs are due right now. */
  dueVehicles: number;
  duePhotos: number;
  /** Sold, still holding photographs, but not yet a week old. */
  waitingVehicles: number;
  /** When the next vehicle becomes due, or null if none is waiting. */
  nextDueAt: Date | null;
}

/**
 * The eleven slots that hold a picture of the vehicle.
 *
 * Written out rather than expressed as "everything except the documents", so
 * that a slot added later is retained by default. Forgetting to exclude a new
 * document slot would delete evidence; forgetting to include a new photo slot
 * only leaves an image in place a little longer, and somebody will notice.
 */
export const PURGEABLE_SLOTS: PhotoSlot[] = [
  "LEFT",
  "RIGHT",
  "FRONT",
  "BACK",
  "CABIN",
  "SLEEP",
  "HANDOVER_LEFT",
  "HANDOVER_RIGHT",
  "HANDOVER_FRONT",
  "HANDOVER_BACK",
  "HANDOVER_CABIN",
];

const soldWithImages = {
  status: "SOLD",
  soldAt: { not: null },
  photos: { some: { slot: { in: PURGEABLE_SLOTS } } },
} as const;

/** What the next sweep would take, without taking it. */
export async function pendingPurge(now: Date = new Date()): Promise<PurgePending> {
  const cutoff = retentionCutoff(now);

  const [due, waiting] = await Promise.all([
    prisma.vehicle.findMany({
      where: { ...soldWithImages, soldAt: { lte: cutoff } },
      // Counted through a filtered select rather than `_count`, which would
      // count the document slots this rule does not touch and report a
      // number larger than the sweep will actually take.
      select: { photos: { where: { slot: { in: PURGEABLE_SLOTS } }, select: { id: true } } },
    }),
    prisma.vehicle.findMany({
      where: { ...soldWithImages, soldAt: { gt: cutoff } },
      orderBy: { soldAt: "asc" },
      select: { soldAt: true },
    }),
  ]);

  const first = waiting[0]?.soldAt ?? null;
  return {
    dueVehicles: due.length,
    duePhotos: due.reduce((n, v) => n + v.photos.length, 0),
    waitingVehicles: waiting.length,
    nextDueAt: first ? new Date(first.getTime() + RETENTION_DAYS * DAY_MS) : null,
  };
}

/**
 * The stored filename behind a served photo URL.
 *
 * Uploads are written as `<uuid>.<ext>` and served through /api/files/<name>,
 * so the last path segment is the name. Anything that does not look like one
 * is left alone: `resolveStoredPath` refuses names outside the pattern, which
 * is the same guard that stops the file route being talked into traversal.
 */
function storedNameOf(url: string): string | null {
  const name = url.split("/").pop();
  if (!name) return null;
  return resolveStoredPath(name) ? name : null;
}

/**
 * Take every photograph that is due.
 *
 * Per vehicle, and in this order: the rows and the audit event commit
 * together in one transaction, and only then are the files unlinked. The
 * reverse order is the one that can leave a row pointing at a file that is no
 * longer there — a broken image on a record somebody is reading. This order's
 * worst case is an orphaned file, which nothing reads and a later sweep of the
 * uploads directory can find.
 *
 * Idempotent. Running it twice takes nothing the second time, because the
 * vehicles it selects are the ones that still have photographs.
 */
export async function purgeSoldVehiclePhotos(now: Date = new Date()): Promise<PurgeResult> {
  const cutoff = retentionCutoff(now);

  const vehicles = await prisma.vehicle.findMany({
    where: { ...soldWithImages, soldAt: { lte: cutoff } },
    select: {
      id: true,
      registrationNo: true,
      soldAt: true,
      photos: { where: { slot: { in: PURGEABLE_SLOTS } }, select: { id: true, url: true } },
    },
  });

  const result: PurgeResult = { vehicles: 0, photos: 0, filesRemoved: 0, filesMissing: 0 };

  for (const v of vehicles) {
    const names = v.photos
      .map((p) => storedNameOf(p.url))
      .filter((n): n is string => n !== null);

    await prisma.$transaction(async (tx) => {
      await tx.vehiclePhoto.deleteMany({
        where: { vehicleId: v.id, slot: { in: PURGEABLE_SLOTS } },
      });
      await recordEvent(tx, {
        vehicleId: v.id,
        // Nobody did this. Leaving the actor null is the honest record, and
        // the timeline already renders an actorless event as the system.
        actorId: null,
        type: "PHOTOS_PURGED",
        field: "photos",
        oldValue: String(v.photos.length),
        newValue: "0",
        note: `${v.photos.length} vehicle photograph${v.photos.length === 1 ? "" : "s"} removed ${RETENTION_DAYS} days after the sale, under the post-sale retention rule. Documents on the file — the estimate, the approval sheet, the capture form — are unchanged.`,
      });
    });

    for (const name of names) {
      const full = resolveStoredPath(name);
      if (!full) continue;
      try {
        await fs.unlink(/*turbopackIgnore: true*/ full);
        result.filesRemoved += 1;
      } catch {
        // Already gone. Normal on a re-run, and not worth failing a sweep
        // over: the row it belonged to is deleted either way.
        result.filesMissing += 1;
      }
    }

    result.vehicles += 1;
    result.photos += v.photos.length;
  }

  return result;
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

/**
 * In-process, not cron.
 *
 * This product deliberately derives everything it can rather than scheduling
 * it — the resale hold is computed from a timestamp precisely so there is no
 * midnight batch to miss. A deletion cannot be derived: something has to
 * actually run. So it runs here, inside the server that is already running,
 * started once from instrumentation.ts.
 *
 * What that buys: no crontab to install, nothing to configure per environment,
 * and no external caller that has to be authenticated. What it costs: the
 * sweep only happens while the server is up, and a server that runs two node
 * processes will run two sweeps. Both are fine — the work is idempotent, and a
 * deletion that is late is a deletion that still happens.
 *
 * The first pass is delayed rather than immediate so a cold start is not
 * competing with the first requests, and both timers are unref'd so this never
 * holds a process open on its own — a build or a script that happens to load
 * this module still exits.
 */
const FIRST_SWEEP_MS = 30_000;
const SWEEP_EVERY_MS = 6 * 3_600_000;

let started = false;

export function startPhotoRetentionSweep(): void {
  if (started) return;
  started = true;

  const run = async () => {
    try {
      const r = await purgeSoldVehiclePhotos();
      if (r.photos > 0) {
        console.log(
          `[retention] removed ${r.photos} photo(s) from ${r.vehicles} sold vehicle(s); ` +
            `${r.filesRemoved} file(s) deleted, ${r.filesMissing} already gone`,
        );
      }
    } catch (err) {
      // Never throw out of a timer: an unhandled rejection here would take the
      // server down over a housekeeping job.
      console.error("[retention] sweep failed:", err);
    }
  };

  setTimeout(run, FIRST_SWEEP_MS).unref?.();
  setInterval(run, SWEEP_EVERY_MS).unref?.();
}

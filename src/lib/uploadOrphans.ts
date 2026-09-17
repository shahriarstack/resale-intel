import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "./prisma";
import { getUploadDir, isSafeStoredName, resolveStoredPath } from "./storage";

/**
 * Files on disk that no record points at.
 *
 * `fs.unlink` appears in exactly one other place in this product — the
 * post-sale retention sweep — and that sweep only ever takes the photographs
 * of a SOLD vehicle. Every other path that removes a photo removes the ROW and
 * leaves the file:
 *
 *   an abandoned capture form   eleven images uploaded from a phone in a yard,
 *                               the officer loses signal and never submits
 *   a re-shot handover set      `deleteMany` then `createMany`, old files stay
 *   a deleted assessment sheet  the engineer removes it; the bytes remain
 *
 * So the upload directory only grows, and nothing on disk can tell a live
 * capture photograph from the wreckage of a form somebody abandoned last
 * March. At 8 MB an upload and eleven slots a capture, on shared hosting, that
 * is a bill and eventually an outage.
 *
 * THIS IS THE DANGEROUS KIND OF CLEANUP, so it is built to be boring:
 *
 *  - It is NOT on a timer. The retention sweep runs itself because its rule is
 *    a date and a status, both of which the database knows. This one's rule is
 *    "nothing references it", which is only as true as the query below is
 *    complete — so a person triggers it, having first read the report.
 *  - A file younger than GRACE_DAYS is never touched, whatever the query says.
 *    An upload sitting in a form that has not been submitted yet is
 *    indistinguishable from an orphan, and will be one for as long as the
 *    officer is still typing.
 *  - The reference query runs BEFORE the listing is filtered, and any failure
 *    throws rather than yielding an empty set. An empty set would mean "delete
 *    everything".
 *
 * If a column that holds a file name is ever added, IT MUST BE ADDED HERE.
 * That is the one way this turns into a deletion of live evidence, so the
 * three sources are listed explicitly rather than discovered.
 */

/** A file this young is assumed to belong to a form still being filled in. */
export const GRACE_DAYS = 2;

const DAY_MS = 86_400_000;

export interface OrphanReport {
  /** Files in the upload directory with a name we recognise. */
  scanned: number;
  /** Of those, referenced by no record and older than the grace period. */
  orphans: number;
  /** What those orphans occupy. */
  bytes: number;
  /** Age of the oldest orphan, in days. */
  oldestDays: number | null;
  /** Files skipped only because they are too new to judge. */
  withinGrace: number;
  graceDays: number;
}

export interface OrphanPurgeResult extends OrphanReport {
  removed: number;
  removedBytes: number;
  /** Unlink failed — permissions, or it went away under us. Not fatal. */
  failed: number;
}

/** The last path segment of a stored URL: `/api/files/<name>` -> `<name>`. */
function nameFromUrl(url: string): string | null {
  const name = url.split("/").pop();
  return name && isSafeStoredName(name) ? name : null;
}

/**
 * Every stored name any record points at.
 *
 * Three sources, and all three are load-bearing:
 *
 *   VehiclePhoto.url          capture, handover, and the document slots
 *   OffroadPhoto.url          accident and Thana case evidence
 *   RepairCostLine.photoName  a bare name, not a URL — the cost line editor
 *                             builds the URL when it renders
 *
 * Selected as narrowly as possible so this stays cheap on a large table.
 */
async function referencedNames(): Promise<Set<string>> {
  const [vehiclePhotos, offroadPhotos, costLines] = await Promise.all([
    prisma.vehiclePhoto.findMany({ select: { url: true } }),
    prisma.offroadPhoto.findMany({ select: { url: true } }),
    prisma.repairCostLine.findMany({
      where: { photoName: { not: null } },
      select: { photoName: true },
    }),
  ]);

  const names = new Set<string>();
  for (const p of vehiclePhotos) {
    const n = nameFromUrl(p.url);
    if (n) names.add(n);
  }
  for (const p of offroadPhotos) {
    const n = nameFromUrl(p.url);
    if (n) names.add(n);
  }
  for (const l of costLines) {
    if (l.photoName && isSafeStoredName(l.photoName)) names.add(l.photoName);
  }
  return names;
}

interface Candidate {
  name: string;
  full: string;
  size: number;
  ageDays: number;
}

/**
 * Walk the upload directory and decide what is orphaned, without touching
 * anything. `purgeOrphans` calls this too, so the report and the deletion can
 * never disagree about the rule.
 */
async function scan(now: Date): Promise<{ report: OrphanReport; orphans: Candidate[] }> {
  const dir = getUploadDir();

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // No upload directory yet — nothing has ever been uploaded.
    return {
      report: {
        scanned: 0,
        orphans: 0,
        bytes: 0,
        oldestDays: null,
        withinGrace: 0,
        graceDays: GRACE_DAYS,
      },
      orphans: [],
    };
  }

  // Read the database BEFORE judging any file. If this throws, the caller gets
  // the error and nothing is deleted — which is the only acceptable failure.
  const referenced = await referencedNames();

  const known = entries.filter(isSafeStoredName);
  const orphans: Candidate[] = [];
  let withinGrace = 0;

  for (const name of known) {
    if (referenced.has(name)) continue;

    const full = resolveStoredPath(name);
    if (!full) continue;

    let stat;
    try {
      stat = await fs.stat(full);
    } catch {
      continue; // vanished between readdir and stat
    }

    const ageDays = (now.getTime() - stat.mtimeMs) / DAY_MS;
    if (ageDays < GRACE_DAYS) {
      withinGrace += 1;
      continue;
    }
    orphans.push({ name, full, size: stat.size, ageDays });
  }

  const bytes = orphans.reduce((n, o) => n + o.size, 0);
  const oldest = orphans.reduce((m, o) => Math.max(m, o.ageDays), 0);

  return {
    report: {
      scanned: known.length,
      orphans: orphans.length,
      bytes,
      oldestDays: orphans.length ? Math.floor(oldest) : null,
      withinGrace,
      graceDays: GRACE_DAYS,
    },
    orphans,
  };
}

/** What a purge would take. Changes nothing. */
export async function pendingOrphans(now: Date = new Date()): Promise<OrphanReport> {
  const { report } = await scan(now);
  return report;
}

/**
 * Delete them.
 *
 * Only the files `scan` returned, and it re-runs the whole rule rather than
 * trusting a list from an earlier request — an admin who reads the report,
 * goes to lunch and then presses the button must not delete a file that was
 * attached to a vehicle while they were out.
 */
export async function purgeOrphans(now: Date = new Date()): Promise<OrphanPurgeResult> {
  const { report, orphans } = await scan(now);

  let removed = 0;
  let removedBytes = 0;
  let failed = 0;

  for (const o of orphans) {
    try {
      await fs.unlink(/*turbopackIgnore: true*/ o.full);
      removed += 1;
      removedBytes += o.size;
    } catch {
      failed += 1;
    }
  }

  if (removed > 0) {
    console.log(
      `[orphans] removed ${removed} unreferenced file(s), ` +
        `${(removedBytes / 1_048_576).toFixed(1)} MB, ${failed} failed`,
    );
  }

  return { ...report, removed, removedBytes, failed };
}

/** Where the files live, for the admin screen to show. */
export function uploadDirPath(): string {
  return path.resolve(getUploadDir());
}

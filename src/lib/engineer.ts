import type { VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daysSince, daysUntil } from "@/lib/format";

/**
 * The Service Engineer's workbench.
 *
 * The old inbox showed two flat lists — "pending" and "submitted" — which hid
 * the three things an engineer actually needs to know before picking up work:
 *
 *   1. Is this a NEW job or one the Service Head sent back? Both sit at
 *      CN_APPROVED and were previously indistinguishable, so a rework looked
 *      like fresh work and the reason for the rejection was invisible.
 *   2. Have I already started this one? A saved draft is real progress that
 *      the list gave no sign of.
 *   3. What deadline am I repairing against? The engineer does the repair, but
 *      `repairDeadline` was only ever surfaced to the Service Head and admin.
 *
 * Everything here is derived from the existing vehicle rows and the
 * VehicleEvent audit spine. No schema change, nothing recorded specially.
 */

/** Statuses that mean the file has moved beyond this engineer's hands. */
const CLEARED: VehicleStatus[] = [
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
  "LIVE_FOR_RESALE",
  "SOLD",
];

export type Bucket = "assess" | "review" | "repair" | "cleared";

export interface WorkbenchVehicle {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  status: VehicleStatus;
  territory: { name: string } | null;
  capturedBy: { name: string } | null;
  createdAt: string;
  repairDeadline: string | null;
  bucket: Bucket;
  /** Days since the file was captured. */
  age: number;
  /** Repair lines already saved against this vehicle. */
  lineCount: number;
  repairTotal: number;
  transportCost: number;
  otherCost: number;
  /** Assessment sheets already uploaded. */
  sheetCount: number;
  /** Saved work that has not been submitted yet. */
  hasDraft: boolean;
  /** Came back from the Service Head rather than arriving fresh. */
  isRework: boolean;
  /** Why it came back, straight from the send-back note. */
  reworkNote: string | null;
  /** Days until the committed repair deadline; negative once missed. */
  daysToDeadline: number | null;
  overdue: boolean;
}

export interface EngineerMetrics {
  awaiting: number;
  rework: number;
  drafts: number;
  underReview: number;
  inRepair: number;
  overdue: number;
  cleared: number;
  /** Value of everything currently sitting on the bench, at current estimate. */
  valueOnBench: number;
  /** How the Service Head has revised this engineer's estimates. */
  adjustment: { count: number; avgPct: number | null; netTk: number };
  /** Submissions that were approved without being sent back. */
  firstTimePass: { submitted: number; sentBack: number; pct: number | null };
}

export interface EngineerWorkbench {
  vehicles: WorkbenchVehicle[];
  metrics: EngineerMetrics;
}

function bucketOf(status: VehicleStatus): Bucket {
  if (status === "CN_APPROVED") return "assess";
  if (status === "COST_SUBMITTED") return "review";
  if (status === "REPAIR_APPROVED") return "repair";
  return "cleared";
}

/** "Tk 279,000" back to 279000. Safe because we wrote the string ourselves. */
function parseTaka(s: string | null): number | null {
  if (!s) return null;
  const digits = s.replace(/[^\d]/g, "");
  return digits ? Number(digits) : null;
}

export async function getEngineerWorkbench(
  engineerId: string,
): Promise<EngineerWorkbench> {
  const rows = await prisma.vehicle.findMany({
    where: {
      assignedEngineerId: engineerId,
      status: { notIn: ["RELEASED"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      registrationNo: true,
      make: true,
      model: true,
      status: true,
      createdAt: true,
      repairDeadline: true,
      territory: { select: { name: true } },
      capturedBy: { select: { name: true } },
      repairLines: { select: { amount: true } },
      costing: { select: { transportCost: true, otherCost: true } },
      photos: { where: { slot: "ASSESSMENT_SHEET" }, select: { id: true } },
      events: {
        where: {
          type: { in: ["REPAIR_SENT_BACK", "ASSESSMENT_SUBMITTED", "FIELD_EDITED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          type: true,
          field: true,
          oldValue: true,
          newValue: true,
          note: true,
          createdAt: true,
        },
      },
    },
  });

  const vehicles: WorkbenchVehicle[] = rows.map((v) => {
    const repairTotal = v.repairLines.reduce((s, l) => s + l.amount, 0);
    const bucket = bucketOf(v.status);

    // Events come newest-first. A file is a rework when the most recent thing
    // that happened to it was being sent back — if it was submitted since,
    // that send-back is already answered and no longer the current state.
    const lastRelevant = v.events.find(
      (e) => e.type === "REPAIR_SENT_BACK" || e.type === "ASSESSMENT_SUBMITTED",
    );
    const isRework =
      bucket === "assess" && lastRelevant?.type === "REPAIR_SENT_BACK";

    const left = daysUntil(v.repairDeadline);

    return {
      id: v.id,
      registrationNo: v.registrationNo,
      make: v.make,
      model: v.model,
      status: v.status,
      territory: v.territory,
      capturedBy: v.capturedBy,
      createdAt: v.createdAt.toISOString(),
      repairDeadline: v.repairDeadline ? v.repairDeadline.toISOString() : null,
      bucket,
      age: daysSince(v.createdAt) ?? 0,
      lineCount: v.repairLines.length,
      repairTotal,
      transportCost: v.costing?.transportCost ?? 0,
      otherCost: v.costing?.otherCost ?? 0,
      sheetCount: v.photos.length,
      // Only meaningful before submission; afterwards the lines are the
      // submission, not a draft.
      hasDraft:
        bucket === "assess" && (v.repairLines.length > 0 || v.photos.length > 0),
      isRework,
      reworkNote: isRework ? (lastRelevant?.note ?? null) : null,
      daysToDeadline: bucket === "repair" ? left : null,
      overdue: bucket === "repair" && left !== null && left < 0,
    };
  });

  // ---- Metrics ----
  let adjCount = 0;
  let adjPctSum = 0;
  let adjNet = 0;
  let submitted = 0;
  let sentBack = 0;

  for (const v of rows) {
    for (const e of v.events) {
      if (e.type === "ASSESSMENT_SUBMITTED") submitted += 1;
      if (e.type === "REPAIR_SENT_BACK") sentBack += 1;
      if (e.type === "FIELD_EDITED" && e.field === "estimate") {
        const from = parseTaka(e.oldValue);
        const to = parseTaka(e.newValue);
        if (from && to && from > 0) {
          adjCount += 1;
          adjPctSum += ((to - from) / from) * 100;
          adjNet += to - from;
        }
      }
    }
  }

  const onBench = vehicles.filter(
    (v) => v.bucket === "assess" || v.bucket === "review" || v.bucket === "repair",
  );

  const metrics: EngineerMetrics = {
    awaiting: vehicles.filter((v) => v.bucket === "assess").length,
    rework: vehicles.filter((v) => v.isRework).length,
    drafts: vehicles.filter((v) => v.hasDraft).length,
    underReview: vehicles.filter((v) => v.bucket === "review").length,
    inRepair: vehicles.filter((v) => v.bucket === "repair").length,
    overdue: vehicles.filter((v) => v.overdue).length,
    cleared: vehicles.filter((v) => v.bucket === "cleared").length,
    valueOnBench: onBench.reduce(
      (s, v) => s + v.repairTotal + v.transportCost + v.otherCost,
      0,
    ),
    adjustment: {
      count: adjCount,
      avgPct: adjCount ? Math.round((adjPctSum / adjCount) * 10) / 10 : null,
      netTk: adjNet,
    },
    firstTimePass: {
      submitted,
      sentBack,
      pct:
        submitted > 0
          ? Math.round(((submitted - sentBack) / submitted) * 100)
          : null,
    },
  };

  return { vehicles, metrics };
}

export { CLEARED };

import type { RepairBlocker, RepairStage, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { daysSince, daysUntil } from "@/lib/format";
import { pairByAngle, readHandover, type Angle } from "@/lib/photos";

/**
 * The Service Engineer's workbench.
 *
 * The old inbox showed two flat lists — "pending" and "submitted" — which hid
 * the three things an engineer actually needs to know before picking up work:
 *
 *   1. Is this a NEW job or one the Service Manager sent back? Both sit at
 *      CN_APPROVED and were previously indistinguishable, so a rework looked
 *      like fresh work and the reason for the rejection was invisible.
 *   2. Have I already started this one? A saved draft is real progress that
 *      the list gave no sign of.
 *   3. What deadline am I repairing against? The engineer does the repair, but
 *      `repairDeadline` was only ever surfaced to the Service Manager and admin.
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
  /** Whose file this is — the heading on every operations screen. Optional in
   *  the schema, so rows imported before the column existed show the name
   *  alone. See the note at the top of lib/vehicle.ts. */
  customerName: string;
  customerCode: string | null;
  status: VehicleStatus;
  territory: { name: string } | null;
  capturedBy: { name: string } | null;
  createdAt: string;
  repairDeadline: string | null;
  bucket: Bucket;
  /** Days since the file was captured. */
  age: number;
  /** The engineer's quoted repair total, once entered. */
  repairTotal: number;
  transportCost: number;
  otherCost: number;
  /** Assessment sheets already uploaded. */
  sheetCount: number;
  /** Sold in the condition it arrived in — no repair was authorised. */
  asIs: boolean;
  /** The Service Manager's reason for needing no work. */
  asIsReason: string | null;
  /** Recovery shot beside post-repair shot, one per angle, for the finish step. */
  handoverPairs: { angle: Angle; before: string | null; after: string | null }[];
  /** Post-repair photographs filed, of the five that close the job. */
  handoverDone: number;
  handoverRequired: number;
  handoverComplete: boolean;
  /** Saved work that has not been submitted yet. */
  hasDraft: boolean;
  /** Came back from the Service Manager rather than arriving fresh. */
  isRework: boolean;
  /** Why it came back, straight from the send-back note. */
  reworkNote: string | null;
  /** Days until the committed repair deadline; negative once missed. */
  daysToDeadline: number | null;
  overdue: boolean;
  /** Latest engineer-reported repair stage. Advisory, never gates anything. */
  repairStage: RepairStage | null;
  /** Why it is blocked, when it is. Only set alongside AWAITING_PARTS. */
  repairBlocker: RepairBlocker | null;
  repairStageNote: string | null;
  repairStageAt: string | null;
}

export interface EngineerMetrics {
  awaiting: number;
  rework: number;
  drafts: number;
  underReview: number;
  inRepair: number;
  /** On the bench, but released for as-is sale — nothing to do. */
  asIs: number;
  overdue: number;
  cleared: number;
  /** Live repairs the engineer has flagged as blocked on parts. */
  blocked: number;
  /** Live repairs still owing their five post-repair photographs. */
  awaitingPhotos: number;
  /** Value of everything currently sitting on the bench, at current estimate. */
  valueOnBench: number;
  /** How the Service Manager has revised this engineer's estimates. */
  adjustment: { count: number; avgPct: number | null; netTk: number };
  /** Submissions that were approved without being sent back. */
  firstTimePass: { submitted: number; sentBack: number; pct: number | null };
}

export interface EngineerWorkbench {
  vehicles: WorkbenchVehicle[];
  metrics: EngineerMetrics;
}

/**
 * REPAIR_APPROVED means two different things, and both belong on the bench.
 *
 * On a normal file it is a live repair. On an as-is file the Service Manager
 * decided there is no work to do — and the engineer needs to be TOLD that,
 * plainly, on the file itself. Hiding it under "cleared" would leave a vehicle
 * they were assigned quietly vanishing with no explanation, which is exactly
 * how someone ends up starting work on it anyway.
 *
 * So it sits in the same bucket, and the card says "no work needed" instead of
 * asking for progress. The counts keep them apart: `inRepair` is work, `asIs`
 * is not.
 */
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
      /**
       * A SOLD AS-IS FILE IS NOT THIS ENGINEER'S ANY MORE.
       *
       * An as-is vehicle sits in the repair queue carrying no work at all —
       * the Service Manager ruled there is nothing to authorise — and it is
       * there for one reason: to TELL the engineer, plainly, that a vehicle
       * they were assigned is being sold in the state it arrived in. Hiding it
       * while that is still news would leave a file quietly vanishing, which
       * is how somebody ends up starting work on it anyway.
       *
       * Once it is sold, that news has been delivered and overtaken. It cannot
       * come back, there is nothing to photograph, nothing to estimate and
       * nothing to report — it is a row the engineer has to read past every
       * time they open the bench, for the rest of the vehicle's life.
       *
       * A REPAIRED vehicle that sells is the opposite case and stays: "Cleared"
       * is the record of work this engineer actually did, and their own month
       * is counted from it. An as-is file records no work, so once it is sold
       * there is nothing about it that is theirs.
       *
       * Both markers are checked. `soldAt` is the sale itself and `status` is
       * where the file sits; they are written in the same transaction, but a
       * queue that empties only when two independent columns agree is a queue
       * that will one day not empty.
       */
      NOT: {
        asIs: true,
        OR: [{ soldAt: { not: null } }, { status: "SOLD" }],
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      registrationNo: true,
      customerName: true,
      customerCode: true,
      make: true,
      model: true,
      status: true,
      asIs: true,
      createdAt: true,
      repairDeadline: true,
      repairStage: true,
      repairBlocker: true,
      repairStageNote: true,
      repairStageAt: true,
      territory: { select: { name: true } },
      capturedBy: { select: { name: true } },
      costing: { select: { repairCost: true, transportCost: true, otherCost: true } },
      photos: { select: { slot: true, url: true } },
      events: {
        where: {
          type: { in: ["REPAIR_SENT_BACK", "ASSESSMENT_SUBMITTED", "FIELD_EDITED", "SOLD_AS_IS"] },
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
    const repairTotal = v.costing?.repairCost ?? 0;
    const bucket = bucketOf(v.status);
    const sheets = v.photos.filter((p) => p.slot === "ASSESSMENT_SHEET");
    const handover = readHandover(v.photos);

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
      customerName: v.customerName,
      customerCode: v.customerCode,
      make: v.make,
      model: v.model,
      status: v.status,
      territory: v.territory,
      capturedBy: v.capturedBy,
      createdAt: v.createdAt.toISOString(),
      repairDeadline: v.repairDeadline ? v.repairDeadline.toISOString() : null,
      bucket,
      age: daysSince(v.createdAt) ?? 0,
      repairTotal,
      transportCost: v.costing?.transportCost ?? 0,
      otherCost: v.costing?.otherCost ?? 0,
      sheetCount: sheets.length,
      asIs: v.asIs,
      // Why the Service Manager decided it needs nothing. Straight off the
      // decision event, so the engineer reads the reasoning rather than just
      // finding the job gone.
      asIsReason: v.events.find((e) => e.type === "SOLD_AS_IS")?.note ?? null,
      handoverPairs: pairByAngle(v.photos).map((r) => ({
        angle: r.angle,
        before: r.before,
        after: r.after,
      })),
      handoverDone: handover.count,
      handoverRequired: handover.required,
      handoverComplete: handover.complete,
      // Only meaningful before submission; afterwards the lines are the
      // submission, not a draft.
      hasDraft: bucket === "assess" && ((v.costing?.repairCost ?? 0) > 0 || sheets.length > 0),
      isRework,
      reworkNote: isRework ? (lastRelevant?.note ?? null) : null,
      // An as-is file has no deadline because no work was authorised, so it
      // can never be late.
      daysToDeadline: bucket === "repair" && !v.asIs ? left : null,
      overdue: bucket === "repair" && !v.asIs && left !== null && left < 0,
      repairStage: v.repairStage,
      repairBlocker: v.repairBlocker,
      repairStageNote: v.repairStageNote,
      repairStageAt: v.repairStageAt ? v.repairStageAt.toISOString() : null,
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
    // Work, and not-work. Both are on the bench; only one of them is a job.
    inRepair: vehicles.filter((v) => v.bucket === "repair" && !v.asIs).length,
    asIs: vehicles.filter((v) => v.bucket === "repair" && v.asIs).length,
    overdue: vehicles.filter((v) => v.overdue).length,
    blocked: vehicles.filter(
      (v) => v.bucket === "repair" && !v.asIs && v.repairStage === "AWAITING_PARTS",
    ).length,
    // Live repairs that cannot be closed until the vehicle is photographed.
    awaitingPhotos: vehicles.filter((v) => v.bucket === "repair" && !v.asIs && !v.handoverComplete)
      .length,
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

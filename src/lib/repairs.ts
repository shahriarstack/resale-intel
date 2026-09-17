import type { RepairStage } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hoursBetween } from "@/lib/format";

/**
 * The Service Manager's repair board.
 *
 * Once the Service Manager approves a repair they have committed money and a
 * date, and then — until now — lost sight of it. The file moves to the
 * Registration desk, so it leaves their inbox, but the repair they authorised
 * is still running. This is the view of that gap.
 *
 * Everything is derived from what approval and the engineer's own reports
 * already wrote: `Costing.repairApprovedAt` starts the clock,
 * `Vehicle.repairDeadline` ends it, and `Vehicle.repairStage` / `repairStageAt`
 * say what the engineer last said and when. No new state, no new writes.
 *
 * Time is carried in HOURS throughout. Days alone cannot distinguish a repair
 * with eight hours left from one with thirty, and that is exactly the
 * distinction worth acting on.
 */

/** A repair is "silent" when nobody has reported on it for this long. */
export const SILENT_HOURS = 48;

export interface LiveRepair {
  id: string;
  registrationNo: string;
  /** The vehicle, which is the SECOND line on this board — see the note at the
   *  top of lib/vehicle.ts. The heading is the account below. */
  name: string;
  customerName: string;
  customerCode: string | null;
  make: string | null;
  territory: string | null;

  engineerId: string | null;
  engineerName: string;
  engineerStaffId: string | null;

  /** When the Service Manager approved it. Null on legacy rows approved before
   *  the timestamp existed — the UI shows those as unmeasurable rather than 0. */
  approvedAt: string | null;
  deadline: string | null;
  /** The window the Service Manager granted, in days. */
  allowedDays: number | null;

  /** Hours since approval. Null when there is no approval timestamp. */
  elapsedHours: number | null;
  /** Hours until the deadline; negative once it has passed. */
  remainingHours: number | null;
  /** How far through the granted window, 0–1+ (over 1 means overdue). */
  burn: number | null;

  stage: RepairStage | null;
  stageNote: string | null;
  stageAt: string | null;
  /** Hours since the last progress report, or since approval if never reported. */
  silentHours: number | null;

  repairCost: number;
}

export interface EngineerRepairSummary {
  id: string;
  name: string;
  staffId: string;

  /** Repairs currently approved and running. */
  live: number;
  overdue: number;
  /** Live repairs with no report inside SILENT_HOURS. */
  silent: number;
  /** Live repairs the engineer has flagged as blocked on parts. */
  awaitingParts: number;
  /** Live repairs reported finished. */
  ready: number;
  /** Stage mix across their live repairs, for the inline bar. */
  stages: Record<string, number>;

  /** Mean hours elapsed across their live repairs. */
  avgElapsedHours: number | null;
  /** How many live repairs that mean is actually based on. Repairs approved
   *  before the approval timestamp existed cannot be measured, and an average
   *  drawn from one of five rows must say so. */
  measuredLive: number;
  /** Worst remaining-hours figure among their live repairs (most negative). */
  worstRemainingHours: number | null;

  /** Completed repairs measured against the deadline they were given. */
  finishedOnTime: number;
  finishedLate: number;
  /** Mean hours from approval to registration completion, historically. */
  avgTurnaroundHours: number | null;

  /** Approved repair cost currently in their hands. */
  valueInFlight: number;
}

export interface RepairBoard {
  repairs: LiveRepair[];
  engineers: EngineerRepairSummary[];
  /** Every active engineer, for the filter — including those with nothing on. */
  roster: { id: string; name: string; staffId: string }[];
  generatedAt: string;
}

const UNASSIGNED = "__unassigned__";

export async function getRepairBoard(): Promise<RepairBoard> {
  const now = new Date();

  const [running, roster, finished] = await Promise.all([
    prisma.vehicle.findMany({
      // As-is files sit at REPAIR_APPROVED too, but no repair was authorised
      // on them. Counting them here would put vehicles nobody is working on
      // into every engineer's live load and every overdue figure.
      where: { status: "REPAIR_APPROVED", asIs: false },
      orderBy: { repairDeadline: "asc" },
      select: {
        id: true,
        registrationNo: true,
        customerName: true,
        customerCode: true,
        make: true,
        model: true,
        repairDeadline: true,
        repairStage: true,
        repairStageNote: true,
        repairStageAt: true,
        territory: { select: { name: true } },
        assignedEngineer: { select: { id: true, name: true, staffId: true } },
        costing: { select: { repairApprovedAt: true, repairDays: true, repairCost: true } },
      },
      take: 1000,
    }),
    prisma.user.findMany({
      where: { role: "SERVICE_ENGINEER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, staffId: true },
    }),
    // Historical record: repairs that have cleared the workshop, with the
    // deadline they were given and when registration actually completed.
    prisma.vehicle.findMany({
      where: {
        repairDeadline: { not: null },
        status: {
          in: ["REGISTRATION_DONE", "SOP_ADDED", "PRICE_APPROVED", "LIVE_FOR_RESALE", "SOLD"],
        },
      },
      select: {
        repairDeadline: true,
        assignedEngineer: { select: { id: true } },
        costing: { select: { repairApprovedAt: true } },
        events: {
          where: { type: "REGISTRATION_COMPLETED" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 1000,
    }),
  ]);

  // ---- Live repairs -------------------------------------------------------
  const repairs: LiveRepair[] = running.map((v) => {
    const approvedAt = v.costing?.repairApprovedAt ?? null;
    const deadline = v.repairDeadline ?? null;

    const elapsedHours = approvedAt ? hoursBetween(approvedAt, now) : null;
    const remainingHours = deadline ? hoursBetween(now, deadline) : null;

    // How far through the granted window. Measured from the real approval and
    // deadline rather than from repairDays, so a deadline edited after the
    // fact is still reflected honestly.
    const windowHours = approvedAt && deadline ? hoursBetween(approvedAt, deadline) : null;
    const burn =
      windowHours && windowHours > 0 && elapsedHours !== null
        ? elapsedHours / windowHours
        : null;

    // Silence is measured from the last report, or from approval when the
    // engineer has never reported at all — an unreported repair is the most
    // silent kind, not an exempt one.
    const lastSignal = v.repairStageAt ?? approvedAt;
    const silentHours = lastSignal ? hoursBetween(lastSignal, now) : null;

    return {
      id: v.id,
      registrationNo: v.registrationNo,
      name: v.model?.trim() || v.make?.trim() || "Vehicle",
      customerName: v.customerName,
      customerCode: v.customerCode,
      make: v.make,
      territory: v.territory?.name ?? null,
      engineerId: v.assignedEngineer?.id ?? null,
      engineerName: v.assignedEngineer?.name ?? "Unassigned",
      engineerStaffId: v.assignedEngineer?.staffId ?? null,
      approvedAt: approvedAt?.toISOString() ?? null,
      deadline: deadline?.toISOString() ?? null,
      allowedDays: v.costing?.repairDays ?? null,
      elapsedHours,
      remainingHours,
      burn,
      stage: v.repairStage,
      stageNote: v.repairStageNote,
      stageAt: v.repairStageAt?.toISOString() ?? null,
      silentHours,
      repairCost: v.costing?.repairCost ?? 0,
    };
  });

  // ---- Historical on-time record, per engineer ----------------------------
  const record = new Map<string, { onTime: number; late: number; turnarounds: number[] }>();
  for (const v of finished) {
    const key = v.assignedEngineer?.id ?? UNASSIGNED;
    const done = v.events[0]?.createdAt;
    if (!done || !v.repairDeadline) continue;
    const r = record.get(key) ?? { onTime: 0, late: 0, turnarounds: [] };
    if (done.getTime() <= v.repairDeadline.getTime()) r.onTime++;
    else r.late++;
    const approvedAt = v.costing?.repairApprovedAt;
    if (approvedAt) r.turnarounds.push(hoursBetween(approvedAt, done));
    record.set(key, r);
  }

  // ---- Per-engineer summary ----------------------------------------------
  // Built over the roster so an engineer with an empty bench still appears —
  // "nothing on" is a scheduling fact the Service Manager needs to see.
  const byEngineer = new Map<string, LiveRepair[]>();
  for (const r of repairs) {
    const key = r.engineerId ?? UNASSIGNED;
    const list = byEngineer.get(key) ?? [];
    list.push(r);
    byEngineer.set(key, list);
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null;

  const summarise = (id: string, name: string, staffId: string): EngineerRepairSummary => {
    const mine = byEngineer.get(id) ?? [];
    const rec = record.get(id) ?? { onTime: 0, late: 0, turnarounds: [] };

    const stages: Record<string, number> = {};
    for (const r of mine) {
      const k = r.stage ?? "UNREPORTED";
      stages[k] = (stages[k] ?? 0) + 1;
    }

    const remaining = mine
      .map((r) => r.remainingHours)
      .filter((h): h is number => h !== null);
    const elapsed = mine.map((r) => r.elapsedHours).filter((h): h is number => h !== null);

    return {
      id,
      name,
      staffId,
      live: mine.length,
      overdue: mine.filter((r) => r.remainingHours !== null && r.remainingHours < 0).length,
      silent: mine.filter((r) => r.silentHours !== null && r.silentHours >= SILENT_HOURS).length,
      awaitingParts: mine.filter((r) => r.stage === "AWAITING_PARTS").length,
      ready: mine.filter((r) => r.stage === "READY").length,
      stages,
      avgElapsedHours: mean(elapsed),
      measuredLive: elapsed.length,
      worstRemainingHours: remaining.length ? Math.min(...remaining) : null,
      finishedOnTime: rec.onTime,
      finishedLate: rec.late,
      avgTurnaroundHours: mean(rec.turnarounds),
      valueInFlight: mine.reduce((s, r) => s + r.repairCost, 0),
    };
  };

  const engineers = roster.map((e) => summarise(e.id, e.name, e.staffId));

  // A repair with no engineer is nobody's queue, which is worse than a busy
  // one. Surfaced as its own row rather than dropped.
  if ((byEngineer.get(UNASSIGNED) ?? []).length > 0) {
    engineers.push(summarise(UNASSIGNED, "Unassigned", "—"));
  }

  return {
    repairs,
    engineers,
    roster,
    generatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Engineer workload — the Service Manager's dashboard table
// ---------------------------------------------------------------------------

/**
 * Where every engineer's work stands, per engineer, one row each.
 *
 * A single axis: the date range filters on `captureDate`, so every column
 * reads as "of the vehicles captured in this window, how many are at each
 * stage of this engineer's work right now". Mixing a period-based throughput
 * count with a point-in-time backlog count in one table would give two columns
 * that look comparable and are not.
 */
export interface EngineerWorkloadRow {
  id: string;
  name: string;
  staffId: string;

  /** Everything assigned to them inside the window. */
  assigned: number;

  /** CN approved — waiting for this engineer to submit a cost analysis. */
  assessmentPending: number;
  /** Of those, ones with work already saved but not submitted. */
  drafted: number;
  /** Of those, ones the Service Manager sent back to be redone. */
  rework: number;

  /** Submitted and sitting on the Service Manager's desk. */
  awaitingApproval: number;

  /** Repair approved and running. */
  inProgress: number;
  /** Stage mix across those running repairs. */
  stages: Record<string, number>;
  /** Running repairs already past the deadline they were given. */
  overdue: number;

  /** Cleared the workshop — registration done or beyond. */
  done: number;
  /** Of those, ones the Service Manager released without any work. */
  asIs: number;
  /** Assigned but not yet arrived: still held by Recovery. These will land on
   *  the engineer's bench later, so they are forward load, not backlog. */
  upstream: number;
  /** Returned to the customer — it will never reach the engineer at all. */
  released: number;

  /** Repair estimate value currently in their hands (pending + approved). */
  valueInHand: number;
}

/** Statuses that mean the engineer's part is finished. */
const CLEARED_STATUSES = [
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
  "LIVE_FOR_RESALE",
  "SOLD",
] as const;

export async function getEngineerWorkload(range: {
  from?: Date | null;
  to?: Date | null;
}): Promise<EngineerWorkloadRow[]> {
  const now = new Date();
  const window =
    range.from || range.to
      ? {
          captureDate: {
            ...(range.from ? { gte: range.from } : {}),
            ...(range.to ? { lte: range.to } : {}),
          },
        }
      : {};

  const [roster, vehicles, reworkEvents] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SERVICE_ENGINEER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, staffId: true },
    }),
    prisma.vehicle.findMany({
      where: { assignedEngineerId: { not: null }, ...window },
      select: {
        id: true,
        status: true,
        asIs: true,
        assignedEngineerId: true,
        repairStage: true,
        repairDeadline: true,
        costing: { select: { repairCost: true } },
      },
      take: 3000,
    }),
    // A file back at CN_APPROVED that has been sent back before is rework, not
    // fresh work — the distinction changes how a Service Manager reads a backlog.
    prisma.vehicleEvent.findMany({
      where: { type: "REPAIR_SENT_BACK" },
      select: { vehicleId: true },
      take: 3000,
    }),
  ]);

  const sentBack = new Set(reworkEvents.map((e) => e.vehicleId));

  const blank = (id: string, name: string, staffId: string): EngineerWorkloadRow => ({
    id,
    name,
    staffId,
    assigned: 0,
    assessmentPending: 0,
    drafted: 0,
    rework: 0,
    awaitingApproval: 0,
    inProgress: 0,
    stages: {},
    overdue: 0,
    done: 0,
    asIs: 0,
    upstream: 0,
    released: 0,
    valueInHand: 0,
  });

  const rows = new Map<string, EngineerWorkloadRow>();
  for (const e of roster) rows.set(e.id, blank(e.id, e.name, e.staffId));

  for (const v of vehicles) {
    const key = v.assignedEngineerId!;
    let row = rows.get(key);
    if (!row) {
      // An engineer who has been deactivated still has work attached to them,
      // and hiding it would make the totals lie.
      row = blank(key, "Former engineer", "—");
      rows.set(key, row);
    }

    row.assigned += 1;
    const repairValue = v.costing?.repairCost ?? 0;

    switch (v.status) {
      case "CN_APPROVED":
        row.assessmentPending += 1;
        if (repairValue > 0) row.drafted += 1;
        if (sentBack.has(v.id)) row.rework += 1;
        row.valueInHand += repairValue;
        break;
      case "COST_SUBMITTED":
        row.awaitingApproval += 1;
        row.valueInHand += repairValue;
        break;
      case "REPAIR_APPROVED": {
        // An as-is file is at this status without any work attached to it: it
        // is waiting on Registration, not on the engineer. It counts as done
        // for them, and its estimate is not money in their hands.
        if (v.asIs) {
          row.asIs += 1;
          row.done += 1;
          break;
        }
        row.inProgress += 1;
        row.valueInHand += repairValue;
        const stage = v.repairStage ?? "UNREPORTED";
        row.stages[stage] = (row.stages[stage] ?? 0) + 1;
        if (v.repairDeadline && v.repairDeadline.getTime() < now.getTime()) row.overdue += 1;
        break;
      }
      case "RELEASED":
        row.released += 1;
        break;
      default:
        // CLEARED means the engineer's part is finished; anything else left is
        // CAPTURED or CN_REQUESTED — still upstream of them.
        if ((CLEARED_STATUSES as readonly string[]).includes(v.status)) row.done += 1;
        else row.upstream += 1;
        break;
    }
  }

  return [...rows.values()];
}

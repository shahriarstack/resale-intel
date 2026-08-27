import type { VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STATUS_META } from "@/lib/status";

/**
 * Pipeline analytics.
 *
 * Everything here is derived from data the desks already produce — the vehicle
 * table and the VehicleEvent audit spine. Nothing is recorded specially for
 * reporting, so the numbers cannot drift from what actually happened, and
 * adding these views required no schema change.
 *
 * All of it runs server-side and is called from server components.
 */

/** Statuses that mean a file is still moving through the pipeline. */
const IN_FLIGHT: VehicleStatus[] = [
  "CAPTURED",
  "CN_REQUESTED",
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
];

export interface StageLoad {
  status: VehicleStatus;
  label: string;
  count: number;
  /** Mean days the files currently here have been sitting at this desk. */
  avgDwell: number;
  /** Longest single wait at this desk, in days. */
  maxDwell: number;
}

export interface ThroughputPoint {
  /** Week-commencing date. */
  weekOf: Date;
  label: string;
  count: number;
}

export interface PipelineInsight {
  stages: StageLoad[];
  throughput: ThroughputPoint[];
  /** Median days from capture to live, over files that actually got there. */
  medianCycleDays: number | null;
  /** Number of completed files the cycle time is based on. */
  cycleSample: number;
  /** The desk with the worst average dwell, if any file is waiting at all. */
  bottleneck: StageLoad | null;
  totalInFlight: number;
}

const DAY = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / DAY));
}

/**
 * When each vehicle arrived at the desk it is sitting on now.
 *
 * Falls back to the capture date: a file that has never transitioned has been
 * at its first desk since it was created, and treating that as "0 days" would
 * quietly hide the oldest untouched records — exactly the ones worth seeing.
 */
async function arrivalTimes(
  ids: string[],
  statusById: Map<string, VehicleStatus>,
  createdById: Map<string, Date>,
): Promise<Map<string, Date>> {
  if (ids.length === 0) return new Map();

  const events = await prisma.vehicleEvent.findMany({
    where: { vehicleId: { in: ids }, toStatus: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { vehicleId: true, toStatus: true, createdAt: true },
  });

  const arrived = new Map<string, Date>();
  for (const e of events) {
    // Events come newest-first, so the first match per vehicle is the move
    // that put it where it is now.
    if (arrived.has(e.vehicleId)) continue;
    if (e.toStatus === statusById.get(e.vehicleId)) {
      arrived.set(e.vehicleId, e.createdAt);
    }
  }

  for (const id of ids) {
    if (!arrived.has(id)) {
      const created = createdById.get(id);
      if (created) arrived.set(id, created);
    }
  }
  return arrived;
}

export async function getPipelineInsight(weeks = 8): Promise<PipelineInsight> {
  const now = new Date();

  const inFlight = await prisma.vehicle.findMany({
    where: { status: { in: IN_FLIGHT } },
    select: { id: true, status: true, createdAt: true },
  });

  const statusById = new Map(inFlight.map((v) => [v.id, v.status]));
  const createdById = new Map(inFlight.map((v) => [v.id, v.createdAt]));
  const arrived = await arrivalTimes(
    inFlight.map((v) => v.id),
    statusById,
    createdById,
  );

  // ---- Stage load and dwell ----
  const byStage = new Map<VehicleStatus, number[]>();
  for (const s of IN_FLIGHT) byStage.set(s, []);
  for (const v of inFlight) {
    const at = arrived.get(v.id);
    byStage.get(v.status)?.push(at ? daysBetween(at, now) : 0);
  }

  const stages: StageLoad[] = IN_FLIGHT.map((status) => {
    const dwells = byStage.get(status) ?? [];
    const count = dwells.length;
    const avgDwell = count ? dwells.reduce((s, d) => s + d, 0) / count : 0;
    const maxDwell = count ? Math.max(...dwells) : 0;
    return {
      status,
      label: STATUS_META[status].label,
      count,
      avgDwell: Math.round(avgDwell * 10) / 10,
      maxDwell,
    };
  });

  // The bottleneck is the desk holding files longest on average — but only
  // among desks that actually hold something.
  const occupied = stages.filter((s) => s.count > 0);
  const bottleneck = occupied.length
    ? occupied.reduce((worst, s) => (s.avgDwell > worst.avgDwell ? s : worst))
    : null;

  // ---- Throughput: files pushed live, by week ----
  const since = new Date(now.getTime() - weeks * 7 * DAY);
  const liveEvents = await prisma.vehicleEvent.findMany({
    where: { type: "PUSHED_LIVE", createdAt: { gte: since } },
    select: { createdAt: true },
  });

  // Bucket into week-commencing-Monday slots.
  const buckets = new Map<number, number>();
  const startOfWeek = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    // getDay(): 0 = Sunday. Shift so Monday starts the week.
    const shift = (x.getDay() + 6) % 7;
    x.setDate(x.getDate() - shift);
    return x;
  };

  for (let i = weeks - 1; i >= 0; i--) {
    const w = startOfWeek(new Date(now.getTime() - i * 7 * DAY));
    buckets.set(w.getTime(), 0);
  }
  for (const e of liveEvents) {
    const k = startOfWeek(e.createdAt).getTime();
    if (buckets.has(k)) buckets.set(k, (buckets.get(k) ?? 0) + 1);
  }

  const throughput: ThroughputPoint[] = [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, count]) => {
      const weekOf = new Date(t);
      return {
        weekOf,
        label: weekOf.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
        count,
      };
    });

  // ---- Cycle time: capture to live ----
  const liveOrSold = await prisma.vehicle.findMany({
    where: { status: { in: ["LIVE_FOR_RESALE", "SOLD"] } },
    select: {
      createdAt: true,
      events: {
        where: { type: "PUSHED_LIVE" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });

  const cycles = liveOrSold
    .map((v) => (v.events[0] ? daysBetween(v.createdAt, v.events[0].createdAt) : null))
    .filter((d): d is number => d !== null)
    .sort((a, b) => a - b);

  const medianCycleDays = cycles.length
    ? cycles.length % 2
      ? cycles[(cycles.length - 1) / 2]
      : Math.round(((cycles[cycles.length / 2 - 1] + cycles[cycles.length / 2]) / 2) * 10) / 10
    : null;

  return {
    stages,
    throughput,
    medianCycleDays,
    cycleSample: cycles.length,
    bottleneck,
    totalInFlight: inFlight.length,
  };
}

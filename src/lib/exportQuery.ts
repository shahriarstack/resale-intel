import type { OffroadKind, Role, VehicleStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { computeBreakdown } from "./costing";
import { locationName } from "./vehicle";
import { statusLabel, letterLabel } from "./status";
import { gradeLabel } from "./grades";
import {
  ACCIDENT_SEVERITY_META,
  CAPTURE_REQUEST_META,
  OFFROAD_STATUS_META,
  THANA_REASON_META,
} from "./offroad";
import { roleLabel } from "./rbac";
import { DATASETS, canTakeResaleMoney, type DatasetKey } from "./exports";

/**
 * Building the rows behind a dataset.
 *
 * Kept apart from lib/exports.ts, which is the catalogue and is imported by the
 * data room page in the browser. This file imports Prisma.
 *
 * Every loader returns `Record<string, unknown>` keyed by the column keys in
 * the catalogue. The CSV writer then picks the columns the reader's desk is
 * allowed, in catalogue order — which is what guarantees the manifest on screen
 * and the file on disk can never disagree about what is in it.
 */

export interface ExportFilters {
  /** Inclusive, on the dataset's own date column. */
  from?: Date | null;
  to?: Date | null;
  territoryId?: string | null;
}

export interface ExportRows {
  rows: Record<string, unknown>[];
  /** The territory name, when one was filtered to — used in the filename. */
  scope: string | null;
}

const DAY_MS = 86_400_000;

function iso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString().slice(0, 10) : "";
}

function daysSince(d: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / DAY_MS));
}

/**
 * A date range as a Prisma filter.
 *
 * `to` is pushed to the end of its day. A range typed as 1–31 August that
 * silently excluded everything recorded on the 31st after midnight would be
 * wrong in the direction nobody checks.
 */
function range(from?: Date | null, to?: Date | null) {
  if (!from && !to) return undefined;
  const gte = from ?? undefined;
  const lte = to ? new Date(to.getTime() + DAY_MS - 1) : undefined;
  return { ...(gte ? { gte } : {}), ...(lte ? { lte } : {}) };
}

// ---------------------------------------------------------------------------
// Which statuses each vehicle dataset covers
// ---------------------------------------------------------------------------

const CAPTURE_STATUSES: VehicleStatus[] = ["CAPTURED", "CN_REQUESTED"];

const IN_PROCESS_STATUSES: VehicleStatus[] = [
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
];

const RESALE_ALL_STATUSES: VehicleStatus[] = [
  ...IN_PROCESS_STATUSES,
  "LIVE_FOR_RESALE",
  "SOLD",
];

// ---------------------------------------------------------------------------
// The off-road union
// ---------------------------------------------------------------------------

const VEHICLE_OFFROAD_SELECT = {
  id: true,
  registrationNo: true,
  customerCode: true,
  customerName: true,
  make: true,
  model: true,
  status: true,
  letterStage: true,
  captureDate: true,
  currentLocationOther: true,
  currentLocation: { select: { name: true } },
  territory: { select: { name: true } },
  capturedBy: { select: { name: true, staffId: true } },
  // The account position lives on the request that authorised the seizure, not
  // on the vehicle. A capture made through a direct-capture window has no
  // request and therefore no ledger figures — those cells are empty, which is
  // the honest answer rather than a zero.
  captureRequest: {
    select: { odNumber: true, odAmount: true, outstandingAmount: true },
  },
} as const;

async function captureRows(f: ExportFilters, now: Date): Promise<Record<string, unknown>[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: {
      status: { in: CAPTURE_STATUSES },
      ...(f.territoryId ? { territoryId: f.territoryId } : {}),
      ...(range(f.from, f.to) ? { captureDate: range(f.from, f.to) } : {}),
    },
    orderBy: { captureDate: "desc" },
    select: VEHICLE_OFFROAD_SELECT,
  });

  return vehicles.map((v) => ({
    kind: "Capture",
    reference: v.registrationNo,
    customerCode: v.customerCode ?? "",
    customer: v.customerName,
    make: v.make ?? "",
    model: v.model ?? "",
    territory: v.territory?.name ?? "",
    offRoadSince: iso(v.captureDate),
    daysOffRoad: daysSince(v.captureDate, now),
    state: statusLabel(v.status),
    detail: letterLabel(v.letterStage),
    location: locationName(v),
    // A capture is not expected back. Blank rather than a date, because any
    // date here would be a claim the business is not making.
    expectedBack: "",
    odNumber: v.captureRequest?.odNumber ?? "",
    odAmount: v.captureRequest?.odAmount ?? "",
    outstanding: v.captureRequest?.outstandingAmount ?? "",
    owner: v.capturedBy?.name ?? "",
    ownerStaffId: v.capturedBy?.staffId ?? "",
    recordId: v.id,
  }));
}

async function caseRows(
  kinds: OffroadKind[],
  f: ExportFilters,
  now: Date,
): Promise<Record<string, unknown>[]> {
  const cases = await prisma.offroadCase.findMany({
    where: {
      kind: { in: kinds },
      // Open only. A resolved case is a vehicle that came back, and counting it
      // as off the road is the mistake this whole register exists to avoid.
      status: "OPEN",
      ...(f.territoryId ? { territoryId: f.territoryId } : {}),
      ...(range(f.from, f.to) ? { occurredAt: range(f.from, f.to) } : {}),
    },
    orderBy: { occurredAt: "desc" },
    select: {
      id: true,
      kind: true,
      status: true,
      registrationNo: true,
      customerCode: true,
      customerName: true,
      make: true,
      model: true,
      occurredAt: true,
      approxDays: true,
      revisedDays: true,
      accidentSeverity: true,
      accidentNote: true,
      thanaReason: true,
      thanaReasonNote: true,
      thanaName: true,
      vehicleLocation: true,
      odNumber: true,
      odAmount: true,
      outstandingAmount: true,
      territory: { select: { name: true } },
      openedBy: { select: { name: true, staffId: true } },
    },
  });

  return cases.map((c) => {
    // The desk's revision wins where there is one — that is the whole reason
    // it is a separate column on the record rather than an overwrite.
    const days = c.revisedDays ?? c.approxDays;
    const detail =
      c.kind === "ACCIDENT"
        ? [c.accidentSeverity ? ACCIDENT_SEVERITY_META[c.accidentSeverity].label : null, c.accidentNote]
            .filter(Boolean)
            .join(" — ")
        : [c.thanaReason ? THANA_REASON_META[c.thanaReason].label : null, c.thanaReasonNote]
            .filter(Boolean)
            .join(" — ");

    return {
      kind: c.kind === "ACCIDENT" ? "Accident" : "Thana",
      reference: c.registrationNo,
      customerCode: c.customerCode,
      customer: c.customerName,
      make: c.make ?? "",
      model: c.model ?? "",
      territory: c.territory?.name ?? "",
      offRoadSince: iso(c.occurredAt),
      daysOffRoad: daysSince(c.occurredAt, now),
      state: OFFROAD_STATUS_META[c.status].label,
      detail,
      location: c.vehicleLocation ?? c.thanaName ?? "",
      expectedBack: iso(new Date(c.occurredAt.getTime() + days * DAY_MS)),
      odNumber: c.odNumber ?? "",
      odAmount: c.odAmount ?? "",
      outstanding: c.outstandingAmount ?? "",
      owner: c.openedBy.name,
      ownerStaffId: c.openedBy.staffId,
      recordId: c.id,
    };
  });
}

// ---------------------------------------------------------------------------
// The resale shape
// ---------------------------------------------------------------------------

async function vehicleRows(
  statuses: VehicleStatus[] | null,
  f: ExportFilters,
  dateField: "captureDate" | "soldAt",
): Promise<Record<string, unknown>[]> {
  const r = range(f.from, f.to);
  const vehicles = await prisma.vehicle.findMany({
    where: {
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(f.territoryId ? { territoryId: f.territoryId } : {}),
      ...(r ? { [dateField]: r } : {}),
    },
    orderBy: dateField === "soldAt" ? { soldAt: "desc" } : { captureDate: "desc" },
    select: {
      id: true,
      registrationNo: true,
      customerCode: true,
      customerName: true,
      make: true,
      model: true,
      year: true,
      mileage: true,
      status: true,
      grade: true,
      asIs: true,
      captureDate: true,
      repairDeadline: true,
      soldAt: true,
      currentLocationOther: true,
      currentLocation: { select: { name: true } },
      territory: { select: { name: true } },
      assignedEngineer: { select: { name: true } },
      costing: {
        select: {
          repairCost: true,
          transportCost: true,
          otherCost: true,
          sopCost: true,
          dealerCommission: true,
          approvedPrice: true,
        },
      },
      regLines: { select: { amount: true } },
      bids: {
        where: { withdrawnAt: null },
        orderBy: { amount: "desc" },
        select: { amount: true },
      },
    },
  });

  return vehicles.map((v) => {
    const b = computeBreakdown(v.costing, v.regLines, v.asIs);
    return {
      reference: v.registrationNo,
      customerCode: v.customerCode ?? "",
      customer: v.customerName,
      make: v.make ?? "",
      model: v.model ?? "",
      year: v.year ?? "",
      mileage: v.mileage ?? "",
      status: statusLabel(v.status),
      grade: v.grade ? gradeLabel(v.grade) : "",
      asIs: v.asIs ? "Yes" : "No",
      territory: v.territory?.name ?? "",
      location: locationName(v),
      engineer: v.assignedEngineer?.name ?? "",
      captureDate: iso(v.captureDate),
      repairDeadline: iso(v.repairDeadline),
      repair: b.repair,
      transport: b.transport,
      other: b.other,
      registration: b.registration,
      sop: b.sop,
      dealerCommission: b.dealerCommission,
      totalCost: b.total,
      approvedPrice: b.approvedPrice ?? "",
      margin: b.margin ?? "",
      // One decimal, as a bare number so a sheet can still average the column.
      marginPct: b.marginPct === null ? "" : Math.round(b.marginPct * 10) / 10,
      offerCount: v.bids.length,
      topOffer: v.bids[0]?.amount ?? "",
      soldAt: iso(v.soldAt),
      recordId: v.id,
    };
  });
}

// ---------------------------------------------------------------------------
// The two ledgers
// ---------------------------------------------------------------------------

async function requestRows(f: ExportFilters): Promise<Record<string, unknown>[]> {
  const r = range(f.from, f.to);
  const requests = await prisma.captureRequest.findMany({
    where: {
      ...(f.territoryId ? { territoryId: f.territoryId } : {}),
      ...(r ? { requestedAt: r } : {}),
    },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      registrationNo: true,
      customerCode: true,
      customerName: true,
      make: true,
      model: true,
      status: true,
      odNumber: true,
      odAmount: true,
      outstandingAmount: true,
      settlementPossible: true,
      requestedAt: true,
      decidedAt: true,
      decisionNote: true,
      vehicleId: true,
      territory: { select: { name: true } },
      requestedBy: { select: { name: true } },
      decidedBy: { select: { name: true } },
    },
  });

  return requests.map((q) => ({
    reference: q.registrationNo,
    customerCode: q.customerCode,
    customer: q.customerName,
    make: q.make ?? "",
    model: q.model ?? "",
    territory: q.territory?.name ?? "",
    state: CAPTURE_REQUEST_META[q.status].label,
    odNumber: q.odNumber,
    odAmount: q.odAmount,
    outstanding: q.outstandingAmount,
    settlementPossible: q.settlementPossible ? "Yes" : "No",
    requestedAt: iso(q.requestedAt),
    requestedBy: q.requestedBy.name,
    decidedAt: iso(q.decidedAt),
    decidedBy: q.decidedBy?.name ?? "",
    decisionNote: q.decisionNote ?? "",
    becameVehicle: q.vehicleId ? "Yes" : "No",
    recordId: q.id,
  }));
}

async function offerRows(f: ExportFilters): Promise<Record<string, unknown>[]> {
  const r = range(f.from, f.to);
  const offers = await prisma.bid.findMany({
    where: {
      ...(r ? { createdAt: r } : {}),
      ...(f.territoryId ? { vehicle: { territoryId: f.territoryId } } : {}),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      customerName: true,
      amount: true,
      note: true,
      createdAt: true,
      revisedAt: true,
      withdrawnAt: true,
      bidder: { select: { name: true, role: true } },
      salesOfficer: { select: { name: true } },
      vehicle: {
        select: {
          registrationNo: true,
          make: true,
          model: true,
          status: true,
          territory: { select: { name: true } },
          costing: { select: { approvedPrice: true } },
        },
      },
    },
  });

  return offers.map((o) => ({
    reference: o.vehicle.registrationNo,
    make: o.vehicle.make ?? "",
    model: o.vehicle.model ?? "",
    status: statusLabel(o.vehicle.status),
    territory: o.vehicle.territory?.name ?? "",
    customer: o.customerName ?? "",
    amount: o.amount,
    approvedPrice: o.vehicle.costing?.approvedPrice ?? "",
    broughtBy: o.bidder.name,
    broughtByRole: roleLabel(o.bidder.role),
    salesOfficer: o.salesOfficer?.name ?? "",
    state: o.withdrawnAt ? "Withdrawn" : o.revisedAt ? "Revised" : "Standing",
    createdAt: iso(o.createdAt),
    revisedAt: iso(o.revisedAt),
    note: o.note ?? "",
    recordId: o.id,
  }));
}

// ---------------------------------------------------------------------------
// The dispatcher
// ---------------------------------------------------------------------------

export async function loadDataset(
  dataset: DatasetKey,
  f: ExportFilters,
  now: Date = new Date(),
): Promise<ExportRows> {
  const scope = f.territoryId
    ? ((await prisma.territory.findUnique({
        where: { id: f.territoryId },
        select: { name: true },
      }))?.name ?? null)
    : null;

  const rows = await (async (): Promise<Record<string, unknown>[]> => {
    switch (dataset) {
      // The union. Three sources, one shape, sorted together by how long each
      // has been off the road — which is the only ordering that treats a
      // capture and an accident as the comparable things this file says they
      // are.
      case "OFFROAD_ALL": {
        const [captures, cases] = await Promise.all([
          captureRows(f, now),
          caseRows(["ACCIDENT", "THANA"], f, now),
        ]);
        return [...captures, ...cases].sort(
          (a, b) => Number(b.daysOffRoad) - Number(a.daysOffRoad),
        );
      }
      case "OFFROAD_CAPTURES":
        return captureRows(f, now);
      case "OFFROAD_ACCIDENTS":
        return caseRows(["ACCIDENT"], f, now);
      case "OFFROAD_THANA":
        return caseRows(["THANA"], f, now);

      case "RESALE_IN_PROCESS":
        return vehicleRows(IN_PROCESS_STATUSES, f, "captureDate");
      case "RESALE_LIVE":
        return vehicleRows(["LIVE_FOR_RESALE"], f, "captureDate");
      // Filtered on the sale date, not the capture date: somebody asking what
      // sold in August means sold in August.
      case "RESALE_SOLD":
        return vehicleRows(["SOLD"], f, "soldAt");
      case "RESALE_ALL":
        return vehicleRows(RESALE_ALL_STATUSES, f, "captureDate");
      case "VEHICLES_ALL":
        return vehicleRows(null, f, "captureDate");

      case "CAPTURE_REQUESTS":
        return requestRows(f);
      case "OFFERS":
        return offerRows(f);
    }
  })();

  return { rows, scope };
}

/**
 * The header row and the value rows, with the reader's desk applied.
 *
 * The single place a column list becomes a grid. Both the manifest and the file
 * go through `columnsFor`, so a column withheld on screen is a column absent
 * from the download, by construction rather than by two lists agreeing.
 */
export function toGrid(
  dataset: DatasetKey,
  role: Role,
  rows: Record<string, unknown>[],
): unknown[][] {
  const cols = DATASETS[dataset].columns.filter(
    (c) => !c.money || canTakeResaleMoney(role),
  );
  return [cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => r[c.key] ?? ""))];
}

/**
 * The three filters, or the reason one of them is unusable.
 *
 * Lives here rather than in a route so both the manifest and the file parse the
 * query the same way. An off-by-one between the two would show one row count on
 * screen and write a different one to disk, which is the kind of discrepancy
 * nobody catches until a figure has already been reported upward.
 *
 * Returns a plain object rather than throwing: both callers want to answer with
 * a 400 carrying the message, and neither wants a try/catch to do it.
 */
export function readFilters(params: URLSearchParams): ExportFilters | { error: string } {
  const read = (raw: string | null, label: string): Date | null | { error: string } => {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? { error: `${label} is not a date` } : d;
  };

  const from = read(params.get("from"), "From");
  if (from && "error" in from) return from;
  const to = read(params.get("to"), "To");
  if (to && "error" in to) return to;
  if (from && to && from > to) return { error: "The range ends before it starts" };

  return { from, to, territoryId: params.get("territory")?.trim() || null };
}

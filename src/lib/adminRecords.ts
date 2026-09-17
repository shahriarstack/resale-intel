import type {
  AdminRecordKind,
  OffroadCaseStatus,
  Prisma,
  VehicleStatus,
} from "@prisma/client";
import { prisma } from "./prisma";
import { statusLabel } from "./status";
import { OFFROAD_STATUS_META, OFFROAD_KIND_META } from "./offroad";

/**
 * One list over three books.
 *
 * An administrator looking for a record does not think in tables. They think
 * "CTG-11-3456", or "everything Rahim raised in June that is still sitting at
 * the engineer". That record might be a Vehicle, a CaptureRequest that was
 * never captured against, or an OffroadCase — and which of the three it is, is
 * exactly the thing they do not know yet. So this searches all three and
 * returns one shape.
 *
 * The three are genuinely different books and the shape does not pretend
 * otherwise: `kind` survives to the row, the stage vocabulary stays each
 * book's own, and the console shows them as three filters rather than
 * flattening them into a single fake status.
 *
 * READ-ONLY. Nothing here writes; the delete and correct paths are their own
 * endpoints so that a search can never be one typo away from a mutation.
 */

export interface AdminRecordRow {
  kind: AdminRecordKind;
  id: string;
  /** How the record names itself — a registration number, nearly always. */
  label: string;
  customer: string | null;
  customerCode: string | null;
  /** The stage, in that book's own vocabulary. */
  stage: string;
  stageKey: string;
  territory: string | null;
  /** Who put it there. */
  owner: string | null;
  createdAt: string;
  /** Small facts worth seeing without opening the record. */
  facts: string[];
  /**
   * What deleting this would take with it, counted now. Shown before the act,
   * not after — see AdminDeletion.
   */
  cascade: { photos: number; events: number; bids: number };
  /** Vehicles have a detail screen to open; the other two do not. */
  href: string | null;
}

export interface AdminRecordFilters {
  kinds: AdminRecordKind[];
  /** Stage keys, across all three vocabularies. Empty means every stage. */
  stages: string[];
  territoryId: string | null;
  from: Date | null;
  to: Date | null;
  q: string | null;
}

export interface AdminRecordPage {
  rows: AdminRecordRow[];
  /** How many matched before the page limit, per kind. */
  totals: Record<AdminRecordKind, number>;
  truncated: boolean;
  limit: number;
}

/**
 * Deliberately not pagination.
 *
 * A correcting administrator is looking for a handful of records, and the
 * honest answer to "your filter matched nine hundred things" is to narrow the
 * filter rather than to page through them — particularly when the next thing
 * they might do is select all and delete. The count is reported in full so the
 * breadth of a filter is visible even when the list is cut.
 */
const LIMIT = 200;

/** Text search, applied to the fields somebody would actually type. */
function textWhere(q: string) {
  return [
    { registrationNo: { contains: q } },
    { customerName: { contains: q } },
    { customerCode: { contains: q } },
  ];
}

export async function searchAdminRecords(
  f: AdminRecordFilters,
): Promise<AdminRecordPage> {
  const wantVehicle = f.kinds.includes("VEHICLE");
  const wantRequest = f.kinds.includes("CAPTURE_REQUEST");
  const wantCase = f.kinds.includes("OFFROAD_CASE");

  const created: Prisma.DateTimeFilter | undefined =
    f.from || f.to
      ? { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
      : undefined;

  // Each book filters on its own stage column, and a stage that belongs to
  // another book simply matches nothing there — which is the correct answer,
  // not an error. It means a stage filter can be applied across kinds without
  // the caller having to know which vocabulary each value came from.
  const vehicleStages = f.stages.filter((s) => VEHICLE_STAGE_KEYS.has(s));
  const requestStages = f.stages.filter((s) => REQUEST_STAGE_KEYS.has(s));
  const caseStages = f.stages.filter((s) => CASE_STAGE_KEYS.has(s));

  const [vehicles, vehicleCount, requests, requestCount, cases, caseCount] =
    await Promise.all([
      wantVehicle
        ? prisma.vehicle.findMany({
            where: {
              ...(created ? { createdAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(vehicleStages.length ? { status: { in: vehicleStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              registrationNo: true,
              customerName: true,
              customerCode: true,
              status: true,
              make: true,
              model: true,
              createdAt: true,
              territory: { select: { name: true } },
              capturedBy: { select: { name: true } },
              _count: { select: { photos: true, events: true, bids: true } },
            },
          })
        : [],
      wantVehicle
        ? prisma.vehicle.count({
            where: {
              ...(created ? { createdAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(vehicleStages.length ? { status: { in: vehicleStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
          })
        : 0,

      wantRequest
        ? prisma.captureRequest.findMany({
            where: {
              ...(created ? { requestedAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(requestStages.length ? { status: { in: requestStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
            orderBy: { requestedAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              registrationNo: true,
              customerName: true,
              customerCode: true,
              status: true,
              odNumber: true,
              requestedAt: true,
              territory: { select: { name: true } },
              requestedBy: { select: { name: true } },
              _count: { select: { events: true } },
            },
          })
        : [],
      wantRequest
        ? prisma.captureRequest.count({
            where: {
              ...(created ? { requestedAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(requestStages.length ? { status: { in: requestStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
          })
        : 0,

      wantCase
        ? prisma.offroadCase.findMany({
            where: {
              ...(created ? { createdAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(caseStages.length ? { status: { in: caseStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            select: {
              id: true,
              registrationNo: true,
              customerName: true,
              customerCode: true,
              status: true,
              kind: true,
              createdAt: true,
              territory: { select: { name: true } },
              openedBy: { select: { name: true } },
              _count: { select: { photos: true, events: true } },
            },
          })
        : [],
      wantCase
        ? prisma.offroadCase.count({
            where: {
              ...(created ? { createdAt: created } : {}),
              ...(f.territoryId ? { territoryId: f.territoryId } : {}),
              ...(caseStages.length ? { status: { in: caseStages as never } } : {}),
              ...(f.q ? { OR: textWhere(f.q) } : {}),
            },
          })
        : 0,
    ]);

  const rows: AdminRecordRow[] = [
    ...vehicles.map((v) => ({
      kind: "VEHICLE" as const,
      id: v.id,
      label: v.registrationNo,
      customer: v.customerName,
      customerCode: v.customerCode,
      stage: statusLabel(v.status),
      stageKey: v.status as string,
      territory: v.territory?.name ?? null,
      owner: v.capturedBy?.name ?? null,
      createdAt: v.createdAt.toISOString(),
      facts: [[v.make, v.model].filter(Boolean).join(" ")].filter(Boolean),
      cascade: {
        photos: v._count.photos,
        events: v._count.events,
        bids: v._count.bids,
      },
      href: `/vehicles/${v.id}`,
    })),
    ...requests.map((r) => ({
      kind: "CAPTURE_REQUEST" as const,
      id: r.id,
      label: r.registrationNo,
      customer: r.customerName,
      customerCode: r.customerCode,
      stage: REQUEST_STAGE_LABEL[r.status] ?? r.status,
      stageKey: r.status as string,
      territory: r.territory?.name ?? null,
      owner: r.requestedBy?.name ?? null,
      createdAt: r.requestedAt.toISOString(),
      facts: [`${r.odNumber} instalment${r.odNumber === 1 ? "" : "s"} overdue`],
      cascade: { photos: 0, events: r._count.events, bids: 0 },
      href: null,
    })),
    ...cases.map((c) => ({
      kind: "OFFROAD_CASE" as const,
      id: c.id,
      label: c.registrationNo,
      customer: c.customerName,
      customerCode: c.customerCode,
      stage: OFFROAD_STATUS_META[c.status]?.label ?? c.status,
      stageKey: c.status as string,
      territory: c.territory?.name ?? null,
      owner: c.openedBy?.name ?? null,
      createdAt: c.createdAt.toISOString(),
      facts: [OFFROAD_KIND_META[c.kind]?.label ?? c.kind],
      cascade: { photos: c._count.photos, events: c._count.events, bids: 0 },
      href: null,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    rows,
    totals: {
      VEHICLE: vehicleCount,
      CAPTURE_REQUEST: requestCount,
      OFFROAD_CASE: caseCount,
    },
    truncated:
      vehicles.length >= LIMIT || requests.length >= LIMIT || cases.length >= LIMIT,
    limit: LIMIT,
  };
}

// ---------------------------------------------------------------------------
// Stage vocabularies
//
// Written out rather than read off the Prisma enums at runtime, because the
// console groups them by book and orders them by how the work actually flows
// — which no generated list can know.
// ---------------------------------------------------------------------------

export const VEHICLE_STAGES = [
  "CAPTURED",
  "CN_REQUESTED",
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
  "LIVE_FOR_RESALE",
  "SOLD",
  "RELEASED",
] as const;

export const REQUEST_STAGES = ["PENDING", "APPROVED", "DECLINED", "CAPTURED"] as const;

export const CASE_STAGES = [
  "OPEN",
  "RESOLVED_ONROAD",
  "RELEASED_TO_CUSTOMER",
  "CONVERTED_TO_CAPTURE",
] as const;

const REQUEST_STAGE_LABEL: Record<string, string> = {
  PENDING: "Awaiting decision",
  APPROVED: "Approved",
  DECLINED: "Declined",
  CAPTURED: "Captured against",
};

const VEHICLE_STAGE_KEYS = new Set<string>(VEHICLE_STAGES);
const REQUEST_STAGE_KEYS = new Set<string>(REQUEST_STAGES);
const CASE_STAGE_KEYS = new Set<string>(CASE_STAGES);

/**
 * `CAPTURED` is in two vocabularies and means different things in each: a
 * vehicle held by the Recovery Team, and a request that has been spent. Both
 * filters apply when it is selected, which is the behaviour an administrator
 * searching for "captured" actually wants.
 */
export function stageLabelFor(kind: AdminRecordKind, key: string): string {
  if (kind === "CAPTURE_REQUEST") return REQUEST_STAGE_LABEL[key] ?? key;
  if (kind === "OFFROAD_CASE") {
    return OFFROAD_STATUS_META[key as OffroadCaseStatus]?.label ?? key;
  }
  return statusLabel(key as VehicleStatus);
}

export const KIND_LABEL: Record<AdminRecordKind, string> = {
  VEHICLE: "Vehicle",
  CAPTURE_REQUEST: "Capture request",
  OFFROAD_CASE: "Off-road case",
};

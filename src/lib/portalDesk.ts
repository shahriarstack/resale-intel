import type { LetterStage, OffroadKind, OffroadCaseStatus, VehicleStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { computeBreakdown } from "./costing";
import { nextAction } from "./letterSchedule";
import {
  hasModule,
  maskName,
  portalCaseWhere,
  portalVehicleWhere,
  moduleInertReason,
  type PortalGrant,
} from "./portals";

/**
 * What a portal member's workspace is made of.
 *
 * Every query in this file starts from `portalVehicleWhere(grant)` or
 * `portalCaseWhere(grant)` and narrows from there. That is the whole access
 * story for the read side: there is no second filter applied later, no panel
 * that assembles its own scope, and no way for a panel to widen one — the
 * clause is built once, in lib/portals.ts, and every loader takes it as given.
 *
 * REDACTION HAPPENS HERE, not in the components. A masked figure is returned
 * as `null` and a masked name as its mask, so the real value never enters the
 * payload the page renders from. The components below render "Tk ••••" for a
 * null, which means a component cannot leak a number it was never handed — and
 * a mistake in a component cannot become a disclosure.
 *
 * Only granted panels are queried. A portal with two panels runs two queries,
 * not eight, and an inert panel (see `moduleInertReason`) runs none at all.
 */

export interface RegisterRow {
  id: string;
  registrationNo: string;
  /** Already masked when the customer lens is off. */
  customer: string;
  vehicle: string;
  status: VehicleStatus;
  territory: string | null;
  location: string | null;
  captureDate: Date;
  /** null when the cost lens is off, or when nothing has been costed yet. */
  cost: number | null;
  /** null when the offers lens is off. The count is never masked — that a
   *  vehicle is attracting interest is not itself a sensitive figure. */
  topOffer: number | null;
  offerCount: number;
  photoCount: number | null;
}

export interface PipelineRow {
  status: VehicleStatus;
  n: number;
}

export interface CaseRow {
  id: string;
  kind: OffroadKind;
  status: OffroadCaseStatus;
  registrationNo: string;
  customer: string;
  territory: string | null;
  occurredAt: Date;
  days: number;
}

export interface MarginRow {
  id: string;
  registrationNo: string;
  vehicle: string;
  soldAt: Date | null;
  price: number;
  cost: number;
  margin: number;
}

export interface SpreadRow {
  territory: string;
  n: number;
  /** null when the cost lens is off. */
  value: number | null;
}

export interface RepairRow {
  id: string;
  registrationNo: string;
  vehicle: string;
  deadline: Date;
  daysLeft: number;
  engineer: string | null;
}

export interface LadderRow {
  id: string;
  registrationNo: string;
  customer: string;
  stage: LetterStage;
  label: string;
  detail: string;
  overdue: boolean;
  due: boolean;
}

export interface ActivityRow {
  id: string;
  at: Date;
  type: string;
  registrationNo: string;
  actor: string | null;
  note: string | null;
}

export interface PortalView {
  /** Vehicles inside the portal's scope, whatever panels it shows. */
  inScope: number;
  register?: { rows: RegisterRow[]; total: number };
  pipeline?: PipelineRow[];
  offroad?: CaseRow[];
  margin?: { rows: MarginRow[]; totalPrice: number; totalCost: number; totalMargin: number };
  spread?: SpreadRow[];
  repairs?: RepairRow[];
  ladder?: LadderRow[];
  activity?: ActivityRow[];
}

/** How many rows a panel shows before it stops being a panel and becomes a
 *  report. A portal is a reading surface, not an export. */
const PANEL_LIMIT = 60;

function vehicleName(v: { make: string | null; model: string | null }): string {
  return [v.make, v.model].filter(Boolean).join(" ") || "—";
}

function wants(grant: PortalGrant, m: Parameters<typeof hasModule>[1]): boolean {
  return hasModule(grant, m) && moduleInertReason(m, grant) === null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export async function getPortalView(grant: PortalGrant, now = new Date()): Promise<PortalView> {
  const where = portalVehicleWhere(grant);
  const caseWhere = portalCaseWhere(grant);

  const view: PortalView = { inScope: await prisma.vehicle.count({ where }) };

  // ---- Fleet register --------------------------------------------------
  if (wants(grant, "FLEET_REGISTER")) {
    const rows = await prisma.vehicle.findMany({
      where,
      orderBy: { captureDate: "desc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        registrationNo: true,
        customerName: true,
        customerCode: true,
        make: true,
        model: true,
        status: true,
        captureDate: true,
        asIs: true,
        territory: { select: { name: true } },
        currentLocation: { select: { name: true } },
        currentLocationOther: true,
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
        bids: { select: { amount: true }, orderBy: { amount: "desc" }, take: 1 },
        _count: { select: { bids: true, photos: true } },
      },
    });

    view.register = {
      total: view.inScope,
      rows: rows.map((v) => {
        const breakdown = computeBreakdown(v.costing, v.regLines, v.asIs);
        return {
          id: v.id,
          registrationNo: v.registrationNo,
          customer: grant.showCustomer ? v.customerName : maskName(v.customerName),
          vehicle: vehicleName(v),
          status: v.status,
          territory: v.territory?.name ?? null,
          location: v.currentLocation?.name ?? v.currentLocationOther ?? null,
          captureDate: v.captureDate,
          cost: grant.showCosts ? breakdown.total : null,
          topOffer: grant.showOffers ? (v.bids[0]?.amount ?? null) : null,
          offerCount: v._count.bids,
          photoCount: grant.showPhotos ? v._count.photos : null,
        };
      }),
    };
  }

  // ---- Pipeline --------------------------------------------------------
  if (wants(grant, "RESALE_PIPELINE")) {
    const grouped = await prisma.vehicle.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    });
    view.pipeline = grouped.map((g) => ({ status: g.status, n: g._count._all }));
  }

  // ---- Off-road fleet --------------------------------------------------
  if (wants(grant, "OFFROAD_FLEET")) {
    const cases = await prisma.offroadCase.findMany({
      where: { ...caseWhere, status: "OPEN" },
      orderBy: { occurredAt: "asc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        kind: true,
        status: true,
        registrationNo: true,
        customerName: true,
        customerCode: true,
        occurredAt: true,
        territory: { select: { name: true } },
      },
    });
    view.offroad = cases.map((c) => ({
      id: c.id,
      kind: c.kind,
      status: c.status,
      registrationNo: c.registrationNo,
      customer: grant.showCustomer ? c.customerName : maskName(c.customerName),
      territory: c.territory?.name ?? null,
      occurredAt: c.occurredAt,
      days: Math.max(0, daysBetween(c.occurredAt, now)),
    }));
  }

  // ---- Sales & margin --------------------------------------------------
  //
  // Guarded by `wants`, which already refuses this panel without the cost
  // lens — so by the time the query runs, returning figures is the grant.
  if (wants(grant, "SALES_MARGIN")) {
    const sold = await prisma.vehicle.findMany({
      where: { ...where, status: "SOLD" },
      orderBy: { soldAt: "desc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        soldAt: true,
        asIs: true,
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
      },
    });

    const rows: MarginRow[] = sold.map((v) => {
      const b = computeBreakdown(v.costing, v.regLines, v.asIs);
      const price = b.approvedPrice ?? 0;
      return {
        id: v.id,
        registrationNo: v.registrationNo,
        vehicle: vehicleName(v),
        soldAt: v.soldAt,
        price,
        cost: b.total,
        margin: price - b.total,
      };
    });

    view.margin = {
      rows,
      totalPrice: rows.reduce((n, r) => n + r.price, 0),
      totalCost: rows.reduce((n, r) => n + r.cost, 0),
      totalMargin: rows.reduce((n, r) => n + r.margin, 0),
    };
  }

  // ---- Territory spread ------------------------------------------------
  if (wants(grant, "TERRITORY_SPREAD")) {
    const rows = await prisma.vehicle.findMany({
      where,
      select: {
        territory: { select: { name: true } },
        asIs: true,
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
      },
    });

    const byTerritory = new Map<string, { n: number; value: number }>();
    for (const v of rows) {
      const key = v.territory?.name ?? "Unassigned";
      const entry = byTerritory.get(key) ?? { n: 0, value: 0 };
      entry.n += 1;
      if (grant.showCosts) entry.value += computeBreakdown(v.costing, v.regLines, v.asIs).total;
      byTerritory.set(key, entry);
    }

    view.spread = [...byTerritory.entries()]
      .map(([territory, e]) => ({
        territory,
        n: e.n,
        value: grant.showCosts ? e.value : null,
      }))
      .sort((a, b) => b.n - a.n);
  }

  // ---- Repair watch ----------------------------------------------------
  if (wants(grant, "REPAIR_WATCH")) {
    const rows = await prisma.vehicle.findMany({
      where: { ...where, repairDeadline: { not: null }, status: { in: ["REPAIR_APPROVED"] } },
      orderBy: { repairDeadline: "asc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        repairDeadline: true,
        assignedEngineer: { select: { name: true } },
      },
    });
    view.repairs = rows
      .filter((v): v is typeof v & { repairDeadline: Date } => v.repairDeadline !== null)
      .map((v) => ({
        id: v.id,
        registrationNo: v.registrationNo,
        vehicle: vehicleName(v),
        deadline: v.repairDeadline,
        daysLeft: daysBetween(now, v.repairDeadline),
        engineer: v.assignedEngineer?.name ?? null,
      }));
  }

  // ---- Letter ladder ---------------------------------------------------
  if (wants(grant, "LETTER_LADDER")) {
    const rows = await prisma.vehicle.findMany({
      where: { ...where, status: { in: ["CAPTURED", "CN_REQUESTED"] } },
      orderBy: { captureDate: "asc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        registrationNo: true,
        customerName: true,
        customerCode: true,
        status: true,
        letterStage: true,
        captureDate: true,
        letter1At: true,
        letter2At: true,
        letter3At: true,
      },
    });

    // The same `nextAction` the officer's own card and the dashboard count
    // read. A portal reporting a different "next step" than the person who
    // owes it would be worse than not reporting one.
    view.ladder = rows.map((v) => {
      const next = nextAction(
        {
          captureDate: v.captureDate,
          letter1At: v.letter1At,
          letter2At: v.letter2At,
          letter3At: v.letter3At,
          letterStage: v.letterStage,
          status: v.status,
        },
        now,
      );
      return {
        id: v.id,
        registrationNo: v.registrationNo,
        customer: grant.showCustomer ? v.customerName : maskName(v.customerName),
        stage: v.letterStage,
        label: next.label,
        detail: next.detail,
        overdue: next.overdue,
        due: next.due,
      };
    });
  }

  // ---- Recent activity -------------------------------------------------
  if (wants(grant, "RECENT_ACTIVITY")) {
    const events = await prisma.vehicleEvent.findMany({
      // Filtered through the vehicle rather than by a column of its own: the
      // event table has no territory and no status, so the scope can only be
      // expressed as "on a vehicle this portal may read".
      where: { vehicle: where },
      orderBy: { createdAt: "desc" },
      take: PANEL_LIMIT,
      select: {
        id: true,
        createdAt: true,
        type: true,
        note: true,
        vehicle: { select: { registrationNo: true } },
        actor: { select: { name: true } },
      },
    });
    view.activity = events.map((e) => ({
      id: e.id,
      at: e.createdAt,
      type: e.type,
      registrationNo: e.vehicle.registrationNo,
      actor: e.actor?.name ?? null,
      note: e.note,
    }));
  }

  return view;
}

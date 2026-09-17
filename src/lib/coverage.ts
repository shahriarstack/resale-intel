import type { LetterStage, PostingKind, Prisma, RecoveryPart, VehicleStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { LETTER_META, STATUS_META } from "@/lib/status";
import type { Tone } from "@/lib/status";

/**
 * Territory coverage.
 *
 * One row per territory, answering "where is my book, and who owns it" for the
 * four desks that think geographically: the Recovery Manager runs the field by
 * part, the Sr. Executive and AGM price by territory, and the admin watches
 * all of it.
 *
 * Built from three grouped counts and one thin projection rather than a scan
 * of the vehicle table — the whole page is four queries regardless of how many
 * vehicles exist.
 */

// ---------------------------------------------------------------------------
// Column vocabulary
//
// The status enum names the desk that HOLDS a file. The column headings here
// name what is HAPPENING to it, because a Recovery Manager reading across a
// row is asking "what stage is this territory's work at", not "which inbox is
// it sitting in". Same data, the reading the table is for.
// ---------------------------------------------------------------------------

export interface StageColumn {
  status: VehicleStatus;
  /** Short heading — these sit in a dense table header. */
  label: string;
  /** Long form for the tooltip and the column legend. */
  full: string;
  tone: Tone;
}

export const STAGE_COLUMNS: StageColumn[] = [
  { status: "CAPTURED", label: "Captured", full: "Held by the Recovery Team", tone: "accent" },
  { status: "CN_REQUESTED", label: "CN pending", full: "Credit Note awaiting the Recovery Manager", tone: "warn" },
  { status: "CN_APPROVED", label: "At engineer", full: "With the Service Engineer for assessment", tone: "accent" },
  { status: "COST_SUBMITTED", label: "Cost review", full: "Estimate awaiting the Service Manager", tone: "warn" },
  { status: "REPAIR_APPROVED", label: "In repair", full: "Repair approved — registration costing under way", tone: "accent" },
  { status: "REGISTRATION_DONE", label: "In SOP", full: "Registration checked and estimated — awaiting the Sr. Executive", tone: "accent" },
  { status: "SOP_ADDED", label: "In pricing", full: "SOP set — awaiting AGM / DGM price approval", tone: "accent" },
  { status: "PRICE_APPROVED", label: "Final gate", full: "Priced — awaiting BM sign-off", tone: "ok" },
  { status: "LIVE_FOR_RESALE", label: "Live", full: "On the resale marketplace", tone: "ok" },
  { status: "SOLD", label: "Sold", full: "Sale awarded — terminal", tone: "ok" },
  { status: "RELEASED", label: "Released", full: "Returned to the customer — terminal", tone: "bad" },
];

/** Statuses that mean the file is still moving. Drives the "Active" column. */
const IN_FLIGHT = new Set<VehicleStatus>([
  "CAPTURED",
  "CN_REQUESTED",
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
]);

export const LETTER_COLUMNS: { stage: LetterStage; label: string; tone: Tone }[] = (
  ["NONE", "LETTER_1", "LETTER_2", "LETTER_3", "WRITTEN"] as LetterStage[]
).map((stage) => ({
  stage,
  label: stage === "NONE" ? "No letter" : LETTER_META[stage].label,
  tone: LETTER_META[stage].tone,
}));

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

export interface CoverageRow {
  territoryId: string;
  name: string;
  code: string | null;
  part: RecoveryPart | null;
  isActive: boolean;
  /**
   * The AROs working this territory, and how.
   *
   * `BASE` is the officer posted here; `COVER` is somebody holding it while it
   * has nobody of its own. Two officers on one row is no longer a sign that the
   * roster has drifted — it is the ordinary shape of a vacancy being covered,
   * and the kind is what tells the two situations apart.
   */
  aros: { id: string; name: string; staffId: string; kind: PostingKind }[];
  /** Count per pipeline stage, keyed by status. */
  stages: Record<string, number>;
  /** Count per letter stage. */
  letters: Record<string, number>;
  /** Files still moving through the chain. */
  active: number;
  /** Every record ever attached to this territory. */
  total: number;
  /** Records locked by Letter 3 / Written. */
  locked: number;
  /** Sum of approved selling prices on this territory's priced vehicles. */
  approvedValue: number;
}

export interface CoverageData {
  rows: CoverageRow[];
  /** Territories carrying files but no ARO — a coverage gap worth naming. */
  unmanned: number;
  generatedAt: string;
}

/**
 * The window the summary is counted over.
 *
 * Filtered on `captureDate` rather than `createdAt`: the ARO records when the
 * vehicle was actually seized, which can differ from when they got signal to
 * file it. A manager asking "what did we recover in July" means the seizure,
 * not the paperwork.
 *
 * Both ends are inclusive whole days in server-local time, so a range of
 * 1 – 31 July contains everything captured on the 31st.
 */
export interface DateRange {
  from?: Date | null;
  to?: Date | null;
}

/**
 * Parse the `from`/`to` query parameters into whole local days.
 *
 * A malformed or reversed range is treated as no range at all rather than as
 * an error: a mistyped URL should show the unfiltered page, not a crash.
 */
export function parseRange(from?: string, to?: string): DateRange {
  const start = dayStart(from);
  const end = dayEnd(to);
  if (start && end && start > end) return {};
  return { from: start, to: end };
}

function parts(v?: string): [number, number, number] | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}

/** Local midnight. Built from the parts, not `new Date(string)`, which parses
 *  a bare date as UTC and would shift the boundary by the timezone offset. */
function dayStart(v?: string): Date | null {
  const p = parts(v);
  return p ? new Date(p[0], p[1] - 1, p[2], 0, 0, 0, 0) : null;
}

function dayEnd(v?: string): Date | null {
  const p = parts(v);
  return p ? new Date(p[0], p[1] - 1, p[2], 23, 59, 59, 999) : null;
}

/** The Prisma filter for a range, or `undefined` when unbounded. */
function captureWindow(range: DateRange): Prisma.VehicleWhereInput | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    captureDate: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
  };
}

/**
 * Vehicles whose territory was never set. They exist, they are somebody's
 * problem, and dropping them from a coverage table would quietly under-report
 * the book — so they get a row of their own rather than being discarded.
 */
export const UNASSIGNED_ID = "__unassigned__";

export async function getCoverage(range: DateRange = {}): Promise<CoverageData> {
  const window = captureWindow(range);

  const [territories, byStage, byLetter, lockedRows, priced] = await Promise.all([
    prisma.territory.findMany({
      orderBy: [{ part: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        code: true,
        part: true,
        isActive: true,
        postings: {
          where: { user: { role: "RECOVERY_TEAM", isActive: true } },
          // Based officers first, so the person who belongs here reads before
          // the person helping out.
          orderBy: [{ kind: "asc" }, { user: { name: "asc" } }],
          select: {
            kind: true,
            user: { select: { id: true, name: true, staffId: true } },
          },
        },
      },
    }),
    prisma.vehicle.groupBy({
      by: ["territoryId", "status"],
      ...(window ? { where: window } : {}),
      _count: { _all: true },
    }),
    prisma.vehicle.groupBy({
      by: ["territoryId", "letterStage"],
      ...(window ? { where: window } : {}),
      _count: { _all: true },
    }),
    prisma.vehicle.groupBy({
      by: ["territoryId"],
      where: { isLocked: true, ...window },
      _count: { _all: true },
    }),
    // Two columns only, so this stays cheap even on a large book. Approved
    // price is used rather than a full cost breakdown: that would need the
    // line-item tables joined per row, and this table is about where work is,
    // not what it cost.
    prisma.vehicle.findMany({
      where: { costing: { approvedPrice: { not: null } }, ...window },
      select: { territoryId: true, costing: { select: { approvedPrice: true } } },
      take: 5000,
    }),
  ]);

  const blank = (): CoverageRow => ({
    territoryId: UNASSIGNED_ID,
    name: "Unassigned",
    code: null,
    part: null,
    isActive: true,
    aros: [],
    stages: {},
    letters: {},
    active: 0,
    total: 0,
    locked: 0,
    approvedValue: 0,
  });

  const byId = new Map<string, CoverageRow>();
  for (const t of territories) {
    byId.set(t.id, {
      territoryId: t.id,
      name: t.name,
      code: t.code,
      part: t.part,
      isActive: t.isActive,
      aros: t.postings.map((p) => ({ ...p.user, kind: p.kind })),
      stages: {},
      letters: {},
      active: 0,
      total: 0,
      locked: 0,
      approvedValue: 0,
    });
  }

  // Resolve a grouped row to its coverage row, creating the Unassigned bucket
  // only if something actually lands in it.
  const rowFor = (territoryId: string | null): CoverageRow => {
    const key = territoryId ?? UNASSIGNED_ID;
    let row = byId.get(key);
    if (!row) {
      row = blank();
      byId.set(key, row);
    }
    return row;
  };

  for (const g of byStage) {
    const row = rowFor(g.territoryId);
    const n = g._count._all;
    row.stages[g.status] = (row.stages[g.status] ?? 0) + n;
    row.total += n;
    if (IN_FLIGHT.has(g.status)) row.active += n;
  }

  for (const g of byLetter) {
    const row = rowFor(g.territoryId);
    row.letters[g.letterStage] = (row.letters[g.letterStage] ?? 0) + g._count._all;
  }

  for (const g of lockedRows) {
    rowFor(g.territoryId).locked += g._count._all;
  }

  for (const v of priced) {
    rowFor(v.territoryId).approvedValue += v.costing?.approvedPrice ?? 0;
  }

  const rows = [...byId.values()];

  return {
    rows,
    // A covered vacancy is still a vacancy. Counting the stand-in as the
    // posting is exactly how a territory goes a year without being filled —
    // so this counts territories with nobody BASED in them, whether or not
    // somebody is currently holding the fort.
    unmanned: rows.filter(
      (r) =>
        !r.aros.some((a) => a.kind === "BASE") &&
        r.total > 0 &&
        r.territoryId !== UNASSIGNED_ID,
    ).length,
    generatedAt: new Date().toISOString(),
  };
}

/** Column heading for a status, for callers that only have the enum. */
export function stageLabel(status: VehicleStatus): string {
  return STAGE_COLUMNS.find((c) => c.status === status)?.label ?? STATUS_META[status].label;
}

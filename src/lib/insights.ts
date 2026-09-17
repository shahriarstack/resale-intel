import type {
  EventType,
  LetterStage,
  RepairStage,
  VehicleGrade,
  VehicleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Tone } from "@/lib/status";
import { LETTER_META, STATUS_META } from "@/lib/status";
import { GRADE_META, GRADE_ORDER } from "@/lib/grades";
import { REPAIR_STAGE_META, REPAIR_STAGES } from "@/lib/repair";

/**
 * Desk analytics.
 *
 * One reading per approving desk, answering the questions that desk actually
 * asks before it acts. Everything is derived from rows the pipeline already
 * writes — the vehicle table, the Costing roll-up and the VehicleEvent audit
 * spine — so no figure here can drift from what happened, and none of it
 * needed a schema change.
 *
 * Two rules hold throughout:
 *
 *  1. Every query is bounded. Windows are explicit, `take` is always set on
 *     row-level reads, and counting is pushed into `groupBy`/`aggregate`
 *     rather than pulled into JS. These run on every dashboard load.
 *  2. Nothing is fabricated. Where there is no data yet, the shape returns
 *     null/empty and the UI says so, rather than rendering a confident zero.
 */

const DAY = 86_400_000;

/** How far back rate/velocity figures look. One quarter reads as "recently". */
export const WINDOW_DAYS = 90;
/** Shorter window for activity leaderboards, where "recent" means this month. */
export const ACTIVITY_DAYS = 30;

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, (b.getTime() - a.getTime()) / DAY);
}

function round(n: number, dp = 1): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Median of an unsorted list. Null on an empty set — never 0. */
function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length / 2;
  return s.length % 2 ? s[(s.length - 1) / 2] : round((s[mid - 1] + s[mid]) / 2);
}

function pct(part: number, whole: number): number | null {
  return whole === 0 ? null : round((part / whole) * 100);
}

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** One labelled, counted slice — the input to every bar list and donut. */
export interface Slice {
  key: string;
  label: string;
  count: number;
  tone: Tone;
  /** Optional secondary readout, e.g. "4.2d avg". */
  meta?: string;
}

/** A named money or count component of a stacked total. */
export interface Segment {
  key: string;
  label: string;
  value: number;
  tone: Tone;
}

/** A person and one number about them. */
export interface Leader {
  id: string;
  name: string;
  staffId: string | null;
  value: number;
  meta: string;
}

/** A single headline reading: one number, one caption, one meaning. */
export interface Reading {
  label: string;
  /** Null means "not enough data yet" — the UI renders a hint, not a zero. */
  value: number | null;
  unit: string;
  caption: string;
  tone: Tone;
}

/** How long the files currently waiting have been waiting. */
export interface AgeProfile {
  buckets: Slice[];
  oldest: number;
  total: number;
}

const AGE_BANDS: { key: string; label: string; max: number; tone: Tone }[] = [
  { key: "0-2", label: "Under 3 days", max: 3, tone: "ok" },
  { key: "3-6", label: "3 – 6 days", max: 7, tone: "neutral" },
  { key: "7-13", label: "1 – 2 weeks", max: 14, tone: "warn" },
  { key: "14+", label: "Over 2 weeks", max: Infinity, tone: "bad" },
];

function ageProfile(dates: Date[], now = new Date()): AgeProfile {
  const counts = new Map(AGE_BANDS.map((b) => [b.key, 0]));
  let oldest = 0;
  for (const d of dates) {
    const age = Math.floor(daysBetween(d, now));
    if (age > oldest) oldest = age;
    const band = AGE_BANDS.find((b) => age < b.max) ?? AGE_BANDS[AGE_BANDS.length - 1];
    counts.set(band.key, (counts.get(band.key) ?? 0) + 1);
  }
  return {
    buckets: AGE_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts.get(b.key) ?? 0,
      tone: b.tone,
    })),
    oldest,
    total: dates.length,
  };
}

/**
 * Pair a "started" event with whichever "finished" event followed it, per
 * vehicle, and return how long each pairing took plus a tally of outcomes.
 *
 * Events are walked oldest-first so a file that went round the loop twice
 * (declined, resubmitted, approved) contributes both passes rather than only
 * the last one. That is the honest reading: both decisions were made.
 */
async function pairedDurations(
  startType: EventType,
  endTypes: EventType[],
  since: Date,
): Promise<{ days: number[]; outcomes: Record<string, number> }> {
  const events = await prisma.vehicleEvent.findMany({
    where: { type: { in: [startType, ...endTypes] }, createdAt: { gte: since } },
    orderBy: { createdAt: "asc" },
    select: { vehicleId: true, type: true, createdAt: true },
    take: 4000,
  });

  const open = new Map<string, Date>();
  const days: number[] = [];
  const outcomes: Record<string, number> = {};
  for (const t of endTypes) outcomes[t] = 0;

  for (const e of events) {
    if (e.type === startType) {
      open.set(e.vehicleId, e.createdAt);
      continue;
    }
    outcomes[e.type] = (outcomes[e.type] ?? 0) + 1;
    const started = open.get(e.vehicleId);
    if (started) {
      days.push(daysBetween(started, e.createdAt));
      open.delete(e.vehicleId);
    }
  }

  return { days, outcomes };
}

/** Count events of each given type inside the window, in one grouped query. */
async function countEvents(types: EventType[], since: Date): Promise<Record<string, number>> {
  const rows = await prisma.vehicleEvent.groupBy({
    by: ["type"],
    where: { type: { in: types }, createdAt: { gte: since } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const t of types) out[t] = 0;
  for (const r of rows) out[r.type] = r._count._all;
  return out;
}

/** Total cost of a set of vehicles, split into its five components. */
interface CostRow {
  costing: { repairCost: number; transportCost: number; otherCost: number; sopCost: number } | null;
  regLines: { amount: number }[];
}

function costSegments(rows: CostRow[]): { segments: Segment[]; total: number } {
  let repair = 0;
  let transport = 0;
  let other = 0;
  let registration = 0;
  let sop = 0;

  for (const v of rows) {
    repair += v.costing?.repairCost ?? 0;
    registration += v.regLines.reduce((s, l) => s + l.amount, 0);
    transport += v.costing?.transportCost ?? 0;
    other += v.costing?.otherCost ?? 0;
    sop += v.costing?.sopCost ?? 0;
  }

  const all: Segment[] = [
    { key: "repair", label: "Repair", value: repair, tone: "accent" },
    { key: "registration", label: "Registration", value: registration, tone: "ok" },
    { key: "sop", label: "SOP", value: sop, tone: "warn" },
    { key: "transport", label: "Transport", value: transport, tone: "neutral" },
    { key: "other", label: "Other", value: other, tone: "neutral" },
  ];
  const segments = all.filter((s) => s.value > 0);

  return { segments, total: repair + transport + other + registration + sop };
}

const costSelect = {
  costing: {
    select: { repairCost: true, transportCost: true, otherCost: true, sopCost: true },
  },
  regLines: { select: { amount: true } },
} as const;

// ---------------------------------------------------------------------------
// 1 — Recovery Manager: the Credit Note desk
// ---------------------------------------------------------------------------

export interface RecoveryManagerInsight {
  readings: Reading[];
  age: AgeProfile;
  letters: Slice[];
  territories: Slice[];
  field: Leader[];
  decisions: { approved: number; declined: number };
}

/**
 * What a Recovery Manager needs before ruling on a Credit Note: how long the
 * queue has been waiting, how hard the letters have already been pushed, where
 * the pressure is geographically, and who in the field is generating it.
 */
export async function getRecoveryManagerInsight(): Promise<RecoveryManagerInsight> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const activeSince = new Date(Date.now() - ACTIVITY_DAYS * DAY);

  const [queue, decisionPairs, capturedRecently] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "CN_REQUESTED" },
      select: {
        createdAt: true,
        letterStage: true,
        territory: { select: { name: true } },
      },
      take: 1000,
    }),
    pairedDurations("CN_REQUESTED", ["CN_APPROVED", "CN_DECLINED"], since),
    prisma.vehicle.groupBy({
      by: ["capturedById"],
      where: { createdAt: { gte: activeSince }, capturedById: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { capturedById: "desc" } },
      take: 5,
    }),
  ]);

  const approved = decisionPairs.outcomes.CN_APPROVED ?? 0;
  const declined = decisionPairs.outcomes.CN_DECLINED ?? 0;
  const decided = approved + declined;

  // Names for the field leaderboard, in one lookup rather than per row.
  const aroIds = capturedRecently.map((r) => r.capturedById).filter((x): x is string => !!x);
  const aros = aroIds.length
    ? await prisma.user.findMany({
        where: { id: { in: aroIds } },
        select: { id: true, name: true, staffId: true },
      })
    : [];
  const aroById = new Map(aros.map((u) => [u.id, u]));

  const letterCount = new Map<LetterStage, number>();
  const territoryCount = new Map<string, number>();
  for (const v of queue) {
    letterCount.set(v.letterStage, (letterCount.get(v.letterStage) ?? 0) + 1);
    const t = v.territory?.name ?? "Unassigned";
    territoryCount.set(t, (territoryCount.get(t) ?? 0) + 1);
  }

  return {
    readings: [
      {
        label: "Approval rate",
        value: pct(approved, decided),
        unit: "%",
        caption: `${decided} decided in ${WINDOW_DAYS} days`,
        tone: "ok",
      },
      {
        label: "Decision time",
        value: median(decisionPairs.days),
        unit: "d",
        caption: "Median request to ruling",
        tone: "accent",
      },
      {
        label: "Declined",
        value: declined,
        unit: "",
        caption: "Returned to the field",
        tone: declined > approved ? "bad" : "neutral",
      },
      {
        label: "Waiting now",
        value: queue.length,
        unit: "",
        caption: "Files on this desk",
        tone: queue.length > 0 ? "warn" : "ok",
      },
    ],
    age: ageProfile(queue.map((v) => v.createdAt)),
    letters: (Object.keys(LETTER_META) as LetterStage[])
      .map((k) => ({
        key: k,
        label: LETTER_META[k].label,
        count: letterCount.get(k) ?? 0,
        tone: LETTER_META[k].tone,
      }))
      .filter((s) => s.count > 0),
    territories: [...territoryCount.entries()]
      .map(([name, count]) => ({ key: name, label: name, count, tone: "accent" as Tone }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6),
    field: capturedRecently.map((r) => {
      const u = r.capturedById ? aroById.get(r.capturedById) : undefined;
      return {
        id: r.capturedById ?? "—",
        name: u?.name ?? "Unknown officer",
        staffId: u?.staffId ?? null,
        value: r._count._all,
        meta: `${ACTIVITY_DAYS}d`,
      };
    }),
    decisions: { approved, declined },
  };
}

// ---------------------------------------------------------------------------
// 2 — Service Manager: the repair approval desk
// ---------------------------------------------------------------------------

export interface ServiceHeadInsight {
  readings: Reading[];
  age: AgeProfile;
  repairStages: Slice[];
  engineers: Leader[];
  deadline: { onTime: number; late: number; running: number; overdue: number };
  queueValue: number;
  estimateSegments: Segment[];
}

/**
 * The Service Manager approves money and commits to a date. This reading is built
 * around those two things: what the pending estimates are worth, how often
 * they get adjusted or sent back, and whether the deadlines already committed
 * are being met.
 */
export async function getServiceHeadInsight(): Promise<ServiceHeadInsight> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const activeSince = new Date(Date.now() - ACTIVITY_DAYS * DAY);
  const now = new Date();

  const [queue, live, events, adjustments, submissions] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "COST_SUBMITTED" },
      select: { createdAt: true, ...costSelect },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: { status: "REPAIR_APPROVED" },
      select: { repairStage: true, repairDeadline: true },
      take: 1000,
    }),
    countEvents(["REPAIR_APPROVED", "REPAIR_SENT_BACK", "ASSESSMENT_SUBMITTED"], since),
    prisma.vehicleEvent.count({
      where: { type: "FIELD_EDITED", field: "estimate", createdAt: { gte: since } },
    }),
    prisma.vehicleEvent.groupBy({
      by: ["actorId"],
      where: {
        type: "ASSESSMENT_SUBMITTED",
        createdAt: { gte: activeSince },
        actorId: { not: null },
      },
      _count: { _all: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 5,
    }),
  ]);

  const approvedCount = events.REPAIR_APPROVED ?? 0;
  const sentBack = events.REPAIR_SENT_BACK ?? 0;
  const submitted = events.ASSESSMENT_SUBMITTED ?? 0;

  const engIds = submissions.map((r) => r.actorId).filter((x): x is string => !!x);
  const engineers = engIds.length
    ? await prisma.user.findMany({
        where: { id: { in: engIds } },
        select: { id: true, name: true, staffId: true },
      })
    : [];
  const engById = new Map(engineers.map((u) => [u.id, u]));

  // Deadline performance on repairs that have already cleared this stage:
  // did REGISTRATION_COMPLETED land before the date the Service Manager set?
  const cleared = await prisma.vehicle.findMany({
    where: {
      repairDeadline: { not: null },
      status: { in: ["REGISTRATION_DONE", "SOP_ADDED", "PRICE_APPROVED", "LIVE_FOR_RESALE", "SOLD"] },
    },
    select: {
      repairDeadline: true,
      events: {
        where: { type: "REGISTRATION_COMPLETED" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    take: 800,
  });

  let onTime = 0;
  let late = 0;
  for (const v of cleared) {
    const done = v.events[0]?.createdAt;
    if (!done || !v.repairDeadline) continue;
    if (done.getTime() <= v.repairDeadline.getTime()) onTime++;
    else late++;
  }

  const overdue = live.filter(
    (v) => v.repairDeadline && v.repairDeadline.getTime() < now.getTime(),
  ).length;

  const stageCount = new Map<RepairStage | "UNREPORTED", number>();
  for (const v of live) {
    const k = v.repairStage ?? "UNREPORTED";
    stageCount.set(k, (stageCount.get(k) ?? 0) + 1);
  }

  const { segments, total } = costSegments(queue);

  return {
    readings: [
      {
        label: "Awaiting approval",
        value: queue.length,
        unit: "",
        caption: "Estimates on this desk",
        tone: queue.length > 0 ? "warn" : "ok",
      },
      {
        label: "On-time repairs",
        value: pct(onTime, onTime + late),
        unit: "%",
        caption: `${onTime + late} deadlines measured`,
        tone: "ok",
      },
      {
        label: "Sent back",
        value: pct(sentBack, submitted),
        unit: "%",
        caption: `${sentBack} of ${submitted} assessments`,
        tone: sentBack > 0 ? "bad" : "neutral",
      },
      {
        label: "Estimates adjusted",
        value: pct(adjustments, approvedCount),
        unit: "%",
        caption: "Revised before approval",
        tone: "accent",
      },
    ],
    age: ageProfile(queue.map((v) => v.createdAt)),
    repairStages: [
      ...REPAIR_STAGES.map((s) => ({
        key: s,
        label: REPAIR_STAGE_META[s].label,
        count: stageCount.get(s) ?? 0,
        tone: REPAIR_STAGE_META[s].tone,
      })),
      {
        key: "UNREPORTED",
        label: "Not reported",
        count: stageCount.get("UNREPORTED") ?? 0,
        tone: "neutral" as Tone,
      },
    ].filter((s) => s.count > 0),
    engineers: submissions.map((r) => {
      const u = r.actorId ? engById.get(r.actorId) : undefined;
      return {
        id: r.actorId ?? "—",
        name: u?.name ?? "Unknown engineer",
        staffId: u?.staffId ?? null,
        value: r._count._all,
        meta: "submitted",
      };
    }),
    deadline: { onTime, late, running: live.length, overdue },
    queueValue: total,
    estimateSegments: segments,
  };
}

// ---------------------------------------------------------------------------
// 3 — Sr. Executive: SOP and the proposed price
// ---------------------------------------------------------------------------

export interface SrExecutiveInsight {
  readings: Reading[];
  age: AgeProfile;
  grades: Slice[];
  marginByGrade: { grade: VehicleGrade; label: string; marginPct: number | null; count: number }[];
  costSegments: Segment[];
  queueValue: number;
  ungraded: number;
}

/**
 * The Sr. Executive decides what a vehicle cost and what it is worth. The
 * reading is therefore about composition and grade: where the money went, how
 * grade tracks against realised margin, and how much of the book is still
 * ungraded — an ungraded vehicle is one nobody can price with confidence.
 */
export async function getSrExecutiveInsight(): Promise<SrExecutiveInsight> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);

  const [queue, priced, gradeGroups, ungraded, revisions] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "REGISTRATION_DONE" },
      select: { createdAt: true, ...costSelect },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: {
        grade: { not: null },
        costing: { approvedPrice: { not: null } },
      },
      select: { grade: true, ...costSelect, costing: { select: { repairCost: true, transportCost: true, otherCost: true, sopCost: true, approvedPrice: true } } },
      take: 1000,
    }),
    prisma.vehicle.groupBy({
      by: ["grade"],
      where: { grade: { not: null } },
      _count: { _all: true },
    }),
    prisma.vehicle.count({
      where: {
        grade: null,
        status: { in: ["REGISTRATION_DONE", "SOP_ADDED", "PRICE_APPROVED", "LIVE_FOR_RESALE"] },
      },
    }),
    prisma.vehicleEvent.count({ where: { type: "SOP_UPDATED", createdAt: { gte: since } } }),
  ]);

  // Margin per grade, averaged. Only vehicles that have both a grade and a
  // price contribute — a margin without an approved price is not a margin.
  const byGrade = new Map<VehicleGrade, number[]>();
  for (const v of priced) {
    if (!v.grade) continue;
    const c = v.costing;
    const repair = c?.repairCost ?? 0;
    const reg = v.regLines.reduce((s, l) => s + l.amount, 0);
    const total = repair + reg + (c?.transportCost ?? 0) + (c?.otherCost ?? 0) + (c?.sopCost ?? 0);
    const price = c?.approvedPrice ?? 0;
    if (price <= 0) continue;
    const arr = byGrade.get(v.grade) ?? [];
    arr.push(((price - total) / price) * 100);
    byGrade.set(v.grade, arr);
  }

  const gradeCount = new Map<VehicleGrade, number>();
  for (const g of gradeGroups) if (g.grade) gradeCount.set(g.grade, g._count._all);

  const { segments, total } = costSegments(queue);
  const allMargins = [...byGrade.values()].flat();

  return {
    readings: [
      {
        label: "Awaiting SOP",
        value: queue.length,
        unit: "",
        caption: "Files ready to price",
        tone: queue.length > 0 ? "warn" : "ok",
      },
      {
        label: "Average margin",
        value: allMargins.length
          ? round(allMargins.reduce((s, m) => s + m, 0) / allMargins.length)
          : null,
        unit: "%",
        caption: `Across ${allMargins.length} priced files`,
        tone: "ok",
      },
      {
        label: "Ungraded",
        value: ungraded,
        unit: "",
        caption: "Still without a condition grade",
        tone: ungraded > 0 ? "bad" : "ok",
      },
      {
        label: "SOP revisions",
        value: revisions,
        unit: "",
        caption: `Logged in ${WINDOW_DAYS} days`,
        tone: "accent",
      },
    ],
    age: ageProfile(queue.map((v) => v.createdAt)),
    grades: GRADE_ORDER.map((g) => ({
      key: g,
      label: `${g} · ${GRADE_META[g].label}`,
      count: gradeCount.get(g) ?? 0,
      tone: GRADE_META[g].tone,
    })).filter((s) => s.count > 0),
    marginByGrade: GRADE_ORDER.map((g) => {
      const xs = byGrade.get(g) ?? [];
      return {
        grade: g,
        label: GRADE_META[g].label,
        marginPct: xs.length ? round(xs.reduce((s, m) => s + m, 0) / xs.length) : null,
        count: xs.length,
      };
    }),
    costSegments: segments,
    queueValue: total,
    ungraded,
  };
}

// ---------------------------------------------------------------------------
// 4 — AGM / DGM: the price approval desk
// ---------------------------------------------------------------------------

export interface AgmInsight {
  readings: Reading[];
  age: AgeProfile;
  marginBands: Slice[];
  costSegments: Segment[];
  territories: { name: string; count: number; value: number }[];
  queueValue: number;
  thinFiles: { id: string; regNo: string; name: string; marginPct: number }[];
}

const MARGIN_BANDS: { key: string; label: string; min: number; tone: Tone }[] = [
  { key: "loss", label: "Below cost", min: -Infinity, tone: "bad" },
  { key: "thin", label: "0 – 10%", min: 0, tone: "warn" },
  { key: "fair", label: "10 – 20%", min: 10, tone: "accent" },
  { key: "strong", label: "Over 20%", min: 20, tone: "ok" },
];

/**
 * The AGM/DGM sets the number the business lives or dies on. The reading is
 * margin-shaped: how the priced book is distributed across margin bands, which
 * files are thin enough to need a second look, and what the queue is worth.
 */
export async function getAgmInsight(): Promise<AgmInsight> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);

  const [queue, priced, velocity, revisions] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "SOP_ADDED" },
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        createdAt: true,
        territory: { select: { name: true } },
        ...costSelect,
        costing: {
          select: { repairCost: true, transportCost: true, otherCost: true, sopCost: true, approvedPrice: true },
        },
      },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: {
        costing: { approvedPrice: { not: null } },
        status: { in: ["PRICE_APPROVED", "LIVE_FOR_RESALE", "SOLD"] },
      },
      select: {
        ...costSelect,
        costing: {
          select: { repairCost: true, transportCost: true, otherCost: true, sopCost: true, approvedPrice: true },
        },
      },
      take: 1000,
    }),
    pairedDurations("SOP_SET", ["PRICE_APPROVED"], since),
    countEvents(["PRICE_REVISED", "SENT_BACK"], since),
  ]);

  const marginOf = (v: {
    regLines: { amount: number }[];
    costing:
      | {
          repairCost: number;
          transportCost: number;
          otherCost: number;
          sopCost: number;
          approvedPrice: number | null;
        }
      | null;
  }): number | null => {
    const c = v.costing;
    const price = c?.approvedPrice ?? null;
    if (price === null || price <= 0) return null;
    const total =
      (c?.repairCost ?? 0) +
      v.regLines.reduce((s, l) => s + l.amount, 0) +
      (c?.transportCost ?? 0) +
      (c?.otherCost ?? 0) +
      (c?.sopCost ?? 0);
    return ((price - total) / price) * 100;
  };

  const bandCount = new Map(MARGIN_BANDS.map((b) => [b.key, 0]));
  for (const v of priced) {
    const m = marginOf(v);
    if (m === null) continue;
    const band = [...MARGIN_BANDS].reverse().find((b) => m >= b.min) ?? MARGIN_BANDS[0];
    bandCount.set(band.key, (bandCount.get(band.key) ?? 0) + 1);
  }

  // Files on this desk whose proposed margin is thin enough to be worth a
  // deliberate look before approval. Surfaced by name, not just counted.
  const thinFiles = queue
    .map((v) => {
      const m = marginOf(v);
      return m === null
        ? null
        : {
            id: v.id,
            regNo: v.registrationNo,
            name: v.model?.trim() || v.make?.trim() || "Vehicle",
            marginPct: round(m),
          };
    })
    .filter((x): x is { id: string; regNo: string; name: string; marginPct: number } => x !== null)
    .filter((x) => x.marginPct < 10)
    .sort((a, b) => a.marginPct - b.marginPct)
    .slice(0, 5);

  const territoryMap = new Map<string, { count: number; value: number }>();
  for (const v of queue) {
    const key = v.territory?.name ?? "Unassigned";
    const prev = territoryMap.get(key) ?? { count: 0, value: 0 };
    const c = v.costing;
    const total =
      (c?.repairCost ?? 0) +
      v.regLines.reduce((s, l) => s + l.amount, 0) +
      (c?.transportCost ?? 0) +
      (c?.otherCost ?? 0) +
      (c?.sopCost ?? 0);
    territoryMap.set(key, { count: prev.count + 1, value: prev.value + total });
  }

  const { segments, total } = costSegments(queue);

  return {
    readings: [
      {
        label: "Awaiting price",
        value: queue.length,
        unit: "",
        caption: "Files on this desk",
        tone: queue.length > 0 ? "warn" : "ok",
      },
      {
        label: "Approval time",
        value: median(velocity.days),
        unit: "d",
        caption: "Median SOP to approved",
        tone: "accent",
      },
      {
        label: "Price revisions",
        value: revisions.PRICE_REVISED ?? 0,
        unit: "",
        caption: `Logged in ${WINDOW_DAYS} days`,
        tone: "neutral",
      },
      {
        label: "Returned by BM",
        value: revisions.SENT_BACK ?? 0,
        unit: "",
        caption: "Sent back for repricing",
        tone: (revisions.SENT_BACK ?? 0) > 0 ? "bad" : "ok",
      },
    ],
    age: ageProfile(queue.map((v) => v.createdAt)),
    marginBands: MARGIN_BANDS.map((b) => ({
      key: b.key,
      label: b.label,
      count: bandCount.get(b.key) ?? 0,
      tone: b.tone,
    })).filter((s) => s.count > 0),
    costSegments: segments,
    territories: [...territoryMap.entries()]
      .map(([name, t]) => ({ name, ...t }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    queueValue: total,
    thinFiles,
  };
}

// ---------------------------------------------------------------------------
// 5 — BM: final approval and the marketplace
// ---------------------------------------------------------------------------

export interface GmInsight {
  readings: Reading[];
  age: AgeProfile;
  bidCoverage: Slice[];
  topBidders: Leader[];
  market: {
    liveCount: number;
    liveValue: number;
    soldCount: number;
    soldValue: number;
    avgDaysOnMarket: number | null;
    realisationPct: number | null;
  };
  queueValue: number;
}

/**
 * The BM signs the last approval and closes sales, so this reading spans both:
 * what is waiting for sign-off, and what the marketplace is doing with what
 * already went live. Bid coverage is the headline — a live vehicle nobody has
 * bid on is the one number that says the price is wrong.
 */
export async function getGmInsight(): Promise<GmInsight> {
  const since = new Date(Date.now() - WINDOW_DAYS * DAY);
  const now = new Date();

  const [queue, liveVehicles, soldVehicles, bidGroups, approvalPairs] = await Promise.all([
    prisma.vehicle.findMany({
      where: { status: "PRICE_APPROVED" },
      select: { createdAt: true, ...costSelect },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: { status: "LIVE_FOR_RESALE" },
      select: {
        id: true,
        updatedAt: true,
        costing: { select: { approvedPrice: true } },
        _count: { select: { bids: true } },
      },
      take: 1000,
    }),
    prisma.vehicle.findMany({
      where: { status: "SOLD" },
      select: {
        soldAt: true,
        winningBidId: true,
        costing: { select: { approvedPrice: true } },
        bids: { select: { id: true, amount: true }, take: 200 },
      },
      take: 500,
    }),
    prisma.bid.groupBy({
      by: ["bidderId"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { bidderId: "desc" } },
      take: 5,
    }),
    pairedDurations("PRICE_APPROVED", ["PUSHED_LIVE"], since),
  ]);

  const withBids = liveVehicles.filter((v) => v._count.bids > 0).length;
  const withoutBids = liveVehicles.length - withBids;

  const liveValue = liveVehicles.reduce((s, v) => s + (v.costing?.approvedPrice ?? 0), 0);
  const daysOnMarket = liveVehicles.map((v) => daysBetween(v.updatedAt, now));

  // Realisation: what the winning bid actually fetched against the price that
  // was approved. Above 100% means the market paid over the asking figure.
  let soldValue = 0;
  const realisations: number[] = [];
  for (const v of soldVehicles) {
    const win = v.bids.find((b) => b.id === v.winningBidId);
    if (!win) continue;
    soldValue += win.amount;
    const approved = v.costing?.approvedPrice ?? null;
    if (approved && approved > 0) realisations.push((win.amount / approved) * 100);
  }

  const bidderIds = bidGroups.map((b) => b.bidderId);
  const bidders = bidderIds.length
    ? await prisma.user.findMany({
        where: { id: { in: bidderIds } },
        select: { id: true, name: true, staffId: true },
      })
    : [];
  const bidderById = new Map(bidders.map((u) => [u.id, u]));

  const { total } = costSegments(queue);

  return {
    readings: [
      {
        label: "Awaiting sign-off",
        value: queue.length,
        unit: "",
        caption: "Files at the final gate",
        tone: queue.length > 0 ? "warn" : "ok",
      },
      {
        label: "Bid coverage",
        value: pct(withBids, liveVehicles.length),
        unit: "%",
        caption: `${withoutBids} live with no bids`,
        tone: withoutBids > 0 ? "warn" : "ok",
      },
      {
        label: "Realisation",
        value: realisations.length
          ? round(realisations.reduce((s, r) => s + r, 0) / realisations.length)
          : null,
        unit: "%",
        caption: "Winning bid vs approved price",
        tone: "ok",
      },
      {
        label: "Sign-off time",
        value: median(approvalPairs.days),
        unit: "d",
        caption: "Median approval to live",
        tone: "accent",
      },
    ],
    age: ageProfile(queue.map((v) => v.createdAt)),
    bidCoverage: ([
      { key: "bid", label: "Has bids", count: withBids, tone: "ok" },
      { key: "none", label: "No bids yet", count: withoutBids, tone: "warn" },
    ] as Slice[]).filter((s) => s.count > 0),
    topBidders: bidGroups.map((b) => {
      const u = bidderById.get(b.bidderId);
      return {
        id: b.bidderId,
        name: u?.name ?? "Unknown officer",
        staffId: u?.staffId ?? null,
        value: b._count._all,
        meta: "bids",
      };
    }),
    market: {
      liveCount: liveVehicles.length,
      liveValue,
      soldCount: soldVehicles.length,
      soldValue,
      avgDaysOnMarket: daysOnMarket.length
        ? round(daysOnMarket.reduce((s, d) => s + d, 0) / daysOnMarket.length)
        : null,
      realisationPct: realisations.length
        ? round(realisations.reduce((s, r) => s + r, 0) / realisations.length)
        : null,
    },
    queueValue: total,
  };
}

// ---------------------------------------------------------------------------
// 6 — Super Admin: the whole book
// ---------------------------------------------------------------------------

export interface AdminInsight {
  readings: Reading[];
  deskLoad: { status: VehicleStatus; label: string; count: number; oldest: number; tone: Tone }[];
  eventVolume: Slice[];
  actors: Leader[];
  gradeMix: Slice[];
  letterMix: Slice[];
}

const AUDIT_HIGHLIGHTS: EventType[] = [
  "CAPTURED",
  "CN_APPROVED",
  "ASSESSMENT_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_COMPLETED",
  "PRICE_APPROVED",
  "PUSHED_LIVE",
  "BID_PLACED",
  "SALE_AWARDED",
];

/**
 * Oversight across every desk at once. Where the admin dashboard already shows
 * money and exceptions, this shows *motion*: which desks hold the oldest work,
 * what the organisation actually did this month, and who did it.
 */
export async function getAdminInsight(): Promise<AdminInsight> {
  const since = new Date(Date.now() - ACTIVITY_DAYS * DAY);
  const now = new Date();

  const [byStatus, oldestPerStatus, volume, actorGroups, grades, letters] = await Promise.all([
    prisma.vehicle.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.vehicle.findMany({
      where: {
        status: {
          in: [
            "CAPTURED",
            "CN_REQUESTED",
            "CN_APPROVED",
            "COST_SUBMITTED",
            "REPAIR_APPROVED",
            "REGISTRATION_DONE",
            "SOP_ADDED",
            "PRICE_APPROVED",
          ],
        },
      },
      select: { status: true, createdAt: true },
      take: 2000,
    }),
    countEvents(AUDIT_HIGHLIGHTS, since),
    prisma.vehicleEvent.groupBy({
      by: ["actorId"],
      where: { createdAt: { gte: since }, actorId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { actorId: "desc" } },
      take: 6,
    }),
    prisma.vehicle.groupBy({ by: ["grade"], where: { grade: { not: null } }, _count: { _all: true } }),
    prisma.vehicle.groupBy({ by: ["letterStage"], _count: { _all: true } }),
  ]);

  const actorIds = actorGroups.map((a) => a.actorId).filter((x): x is string => !!x);
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, staffId: true, role: true },
      })
    : [];
  const actorById = new Map(actors.map((u) => [u.id, u]));

  const oldest = new Map<VehicleStatus, number>();
  const counts = new Map<VehicleStatus, number>();
  for (const v of oldestPerStatus) {
    const age = Math.floor(daysBetween(v.createdAt, now));
    if (age > (oldest.get(v.status) ?? -1)) oldest.set(v.status, age);
    counts.set(v.status, (counts.get(v.status) ?? 0) + 1);
  }

  const totalTracked = byStatus.reduce((s, r) => s + r._count._all, 0);
  const eventTotal = Object.values(volume).reduce((s, n) => s + n, 0);

  return {
    readings: [
      {
        label: "Records",
        value: totalTracked,
        unit: "",
        caption: "Every vehicle on the book",
        tone: "accent",
      },
      {
        label: "Actions logged",
        value: eventTotal,
        unit: "",
        caption: `Milestones in ${ACTIVITY_DAYS} days`,
        tone: "ok",
      },
      {
        label: "Active staff",
        value: actorGroups.length,
        unit: "",
        caption: "Touched a file this month",
        tone: "neutral",
      },
      {
        label: "Oldest file",
        value: Math.max(0, ...oldest.values()),
        unit: "d",
        caption: "Longest wait at any desk",
        tone: "warn",
      },
    ],
    deskLoad: [...counts.entries()]
      .map(([status, count]) => {
        const age = oldest.get(status) ?? 0;
        return {
          status,
          label: STATUS_META[status].label,
          count,
          oldest: age,
          tone: (age >= 14 ? "bad" : age >= 7 ? "warn" : "accent") as Tone,
        };
      })
      .sort((a, b) => b.oldest - a.oldest),
    eventVolume: AUDIT_HIGHLIGHTS.map((t) => ({
      key: t,
      label: t,
      count: volume[t] ?? 0,
      tone: "accent" as Tone,
    })).filter((s) => s.count > 0),
    actors: actorGroups.map((a) => {
      const u = a.actorId ? actorById.get(a.actorId) : undefined;
      return {
        id: a.actorId ?? "—",
        name: u?.name ?? "Unknown",
        staffId: u?.staffId ?? null,
        value: a._count._all,
        meta: "actions",
      };
    }),
    gradeMix: GRADE_ORDER.map((g) => ({
      key: g,
      label: `${g} · ${GRADE_META[g].label}`,
      count: grades.find((x) => x.grade === g)?._count._all ?? 0,
      tone: GRADE_META[g].tone,
    })).filter((s) => s.count > 0),
    letterMix: (Object.keys(LETTER_META) as LetterStage[])
      .map((k) => ({
        key: k,
        label: LETTER_META[k].label,
        count: letters.find((x) => x.letterStage === k)?._count._all ?? 0,
        tone: LETTER_META[k].tone,
      }))
      .filter((s) => s.count > 0),
  };
}

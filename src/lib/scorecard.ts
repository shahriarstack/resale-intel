import { prisma } from "@/lib/prisma";
import { REPAIR_STAGE_META } from "@/lib/repair";

/**
 * The engineer scorecard.
 *
 * Every other engineer view in this app is a queue: what is on the bench right
 * now. This is the only one that looks backwards, and it exists to answer one
 * question an engineer currently cannot answer about themselves — "how much did
 * I get through last month, and how fast?"
 *
 * ---------------------------------------------------------------------------
 * What counts as a job, and whose clock it runs on
 * ---------------------------------------------------------------------------
 *
 * A Service Engineer does two separable pieces of work on a file, measured
 * separately because they have different clocks and different failure modes:
 *
 *   ASSESSMENT — starts when the file becomes theirs to assess (the Credit Note
 *     is approved, or they are assigned onto an already-approved file), ends
 *     when they submit the cost analysis.
 *
 *   REPAIR — starts when the Service Manager approves the repair, ends when the
 *     engineer reports the vehicle READY.
 *
 * The start is deliberately NOT the moment the vehicle was assigned to them. A
 * file can sit at CAPTURED for three weeks waiting on a Credit Note the
 * engineer has no influence over; charging that delay to their average would
 * make the number both wrong and demoralising, and a metric people know is
 * unfair is a metric they ignore. The clock starts when the work actually
 * became theirs to do.
 *
 * A send-back restarts the assessment clock. The engineer is genuinely doing
 * the job a second time, so it is a second job — which also means a habit of
 * rework shows up honestly as extra volume that did not need to exist.
 *
 * ---------------------------------------------------------------------------
 * Attribution
 * ---------------------------------------------------------------------------
 *
 * A finished job belongs to whoever finished it: ASSESSMENT_SUBMITTED and
 * REPAIR_PROGRESS both carry the engineer as the event actor, so there is no
 * guessing. An unfinished job belongs to whoever holds the file now. This
 * sidesteps reassignment ambiguity entirely — nobody is ever credited with a
 * submission they did not make.
 *
 * Nothing here is written anywhere. It is all derived from the VehicleEvent
 * spine the workflow already records, so the numbers cannot drift from what
 * actually happened, and removing this view would lose no data.
 */

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** How far back the picker and the trend reach. */
export const HISTORY_MONTHS = 12;

/**
 * Extra history pulled behind the window.
 *
 * A job that finished in January may have started the previous September. If
 * the event fetch began at the window edge that start would be invisible and
 * the duration silently understated, so the fetch reaches back a further year
 * beyond anything that will be displayed.
 */
const LOOKBACK_MONTHS = 12;

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-08" for a date, in local time — the month the workshop lived in. */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthParts(key: string): { y: number; m: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12 || y < 2000 || y > 2999) return null;
  return { y, m: mo };
}

/** A month key that is safe to compute with. Falls back to the current month. */
export function normaliseMonth(key: string | null | undefined): string {
  const trimmed = key?.trim() ?? "";
  if (!monthParts(trimmed)) return monthKeyOf(new Date());
  // Never let the picker address the future; there is nothing there to report.
  const now = monthKeyOf(new Date());
  return trimmed > now ? now : trimmed;
}

/** Local midnight on the first of the month. */
export function monthStart(key: string): Date {
  const p = monthParts(key)!;
  return new Date(p.y, p.m - 1, 1, 0, 0, 0, 0);
}

/** Local midnight on the first of the NEXT month — an exclusive upper bound. */
export function monthEnd(key: string): Date {
  const p = monthParts(key)!;
  return new Date(p.y, p.m, 1, 0, 0, 0, 0);
}

export function monthLabel(key: string): string {
  const p = monthParts(key);
  return p ? `${MONTH_NAMES[p.m - 1]} ${p.y}` : key;
}

export function monthShort(key: string): string {
  const p = monthParts(key);
  return p ? MONTH_NAMES[p.m - 1] : key;
}

/** `n` month keys ending at `endKey`, oldest first. */
export function monthsBack(n: number, endKey: string): string[] {
  const p = monthParts(endKey)!;
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(monthKeyOf(new Date(p.y, p.m - 1 - i, 1)));
  return out;
}

function shiftMonth(key: string, by: number): string {
  const p = monthParts(key)!;
  return monthKeyOf(new Date(p.y, p.m - 1 + by, 1));
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export type JobKind = "assessment" | "repair";

/** One measurable piece of engineer work, with both ends of its clock. */
export interface JobRow {
  id: string;
  vehicleId: string;
  registrationNo: string;
  /** Model, or make, or a plain fallback — whatever names the vehicle best. */
  name: string;
  kind: JobKind;
  engineerId: string;
  startedAt: string;
  /** Null while the job is still open. */
  endedAt: string | null;
  /** Start-to-finish hours. Null while open. */
  hours: number | null;
  /** An assessment being done a second time after a send-back. */
  rework: boolean;
  /** Repairs only: finished on or before the deadline granted. */
  onTime: boolean | null;
  deadline: string | null;
  /**
   * Closed by the file moving on to Registration rather than by the engineer
   * reporting READY. The work did finish, but the timestamp belongs to the next
   * desk, so these are counted and flagged rather than read as clean reports.
   */
  inferred: boolean;
}

export interface KindStat {
  assigned: number;
  completed: number;
  avgHours: number | null;
}

/** Everything one month says about one engineer — or about the whole team. */
export interface MonthStat {
  key: string;
  label: string;

  /** Jobs that landed on the bench in this month. */
  assigned: number;
  /** Jobs finished in this month, whenever they started. */
  completed: number;
  /** Mean start-to-finish hours across the jobs finished in this month. */
  avgHours: number | null;
  /** Median of the same set — one nightmare job cannot move it. */
  medianHours: number | null;

  fastest: { hours: number; label: string } | null;
  slowest: { hours: number; label: string } | null;

  assessment: KindStat;
  repair: KindStat;

  /** Of the jobs that LANDED this month, how many are finished today. */
  cohortDone: number;
  /** Assessments that landed this month because they were sent back. */
  reworks: number;
  /** Repairs finished inside / outside the deadline they were granted. */
  onTime: number;
  late: number;
  /** Jobs still open when the month closed — carried into the next one. */
  carried: number;
}

export interface EngineerRef {
  id: string;
  name: string;
  staffId: string;
}

export interface MonthOption {
  key: string;
  label: string;
  short: string;
  year: number;
}

export interface EngineerScorecard {
  engineer: EngineerRef;
  monthKey: string;
  months: MonthOption[];
  current: MonthStat;
  previous: MonthStat | null;
  /** HISTORY_MONTHS months ending at the selected one, oldest first. */
  history: MonthStat[];
  /** Personal records across the history window. */
  best: {
    completed: { key: string; value: number } | null;
    avgHours: { key: string; value: number } | null;
  };
  /** Everything measurable this engineer has finished inside the fetch window. */
  lifetime: { completed: number; avgHours: number | null };
  /** The same month across the rest of the workshop, for context. */
  team: {
    avgHours: number | null;
    medianCompleted: number | null;
    engineers: number;
    /** 1 = most completed that month. Null when they completed nothing. */
    rank: number | null;
  };
  /** The jobs behind the headline figure, so it is never a black box. */
  jobs: JobRow[];
  /** Jobs open right now, regardless of the month being viewed. */
  openNow: number;
}

export interface TeamScorecardRow {
  engineer: EngineerRef;
  current: MonthStat;
  previous: MonthStat | null;
  /** Completed-per-month series over the history window, oldest first. */
  spark: { key: string; completed: number; avgHours: number | null }[];
  openNow: number;
}

export interface TeamScorecard {
  monthKey: string;
  months: MonthOption[];
  rows: TeamScorecardRow[];
  total: MonthStat;
  previousTotal: MonthStat | null;
  history: MonthStat[];
}

// ---------------------------------------------------------------------------
// Job derivation
// ---------------------------------------------------------------------------

const READY_LABEL = REPAIR_STAGE_META.READY.label;

const JOB_EVENTS = [
  "CN_APPROVED",
  "ENGINEER_ASSIGNED",
  "ASSESSMENT_SUBMITTED",
  "REPAIR_APPROVED",
  "REPAIR_SENT_BACK",
  "REPAIR_PROGRESS",
  "REGISTRATION_COMPLETED",
] as const;

interface OpenJob {
  startedAt: Date;
  rework: boolean;
}

/**
 * Replay the audit spine into a flat list of jobs.
 *
 * One pass per vehicle, in event order, holding at most one open assessment and
 * one open repair. A vehicle can legitimately have neither, either, or — across
 * its life — several of each, which is why this is a replay rather than a set
 * of counts.
 */
async function buildJobs(since: Date): Promise<JobRow[]> {
  const vehicles = await prisma.vehicle.findMany({
    where: { events: { some: { type: { in: [...JOB_EVENTS] }, createdAt: { gte: since } } } },
    select: {
      id: true,
      registrationNo: true,
      make: true,
      model: true,
      status: true,
      repairDeadline: true,
      assignedEngineerId: true,
      events: {
        where: { type: { in: [...JOB_EVENTS] }, createdAt: { gte: since } },
        orderBy: { createdAt: "asc" },
        select: { type: true, actorId: true, newValue: true, createdAt: true },
      },
    },
    take: 4000,
  });

  const jobs: JobRow[] = [];

  for (const v of vehicles) {
    const name = v.model?.trim() || v.make?.trim() || "Vehicle";
    const deadline = v.repairDeadline;

    let assessment: OpenJob | null = null;
    let repair: OpenJob | null = null;
    let seq = 0;

    const push = (
      kind: JobKind,
      engineerId: string,
      startedAt: Date,
      endedAt: Date | null,
      rework: boolean,
      inferred: boolean,
    ) => {
      const raw =
        endedAt === null
          ? null
          : Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 3_600_000);
      jobs.push({
        id: `${v.id}:${kind}:${seq++}`,
        vehicleId: v.id,
        registrationNo: v.registrationNo,
        name,
        kind,
        engineerId,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt?.toISOString() ?? null,
        hours: raw === null ? null : Math.round(raw * 10) / 10,
        rework,
        onTime:
          kind === "repair" && endedAt && deadline
            ? endedAt.getTime() <= deadline.getTime()
            : null,
        deadline: kind === "repair" ? (deadline?.toISOString() ?? null) : null,
        inferred,
      });
    };

    for (const e of v.events) {
      switch (e.type) {
        case "CN_APPROVED":
          // The file becomes assessable. A CN approved while an assessment is
          // somehow already open is not a second job — keep the earlier clock.
          if (!assessment) assessment = { startedAt: e.createdAt, rework: false };
          break;

        case "REPAIR_SENT_BACK":
          // Doing it again is doing it again: a fresh clock, flagged as rework.
          assessment = { startedAt: e.createdAt, rework: true };
          break;

        case "ENGINEER_ASSIGNED":
          // Landing on a new bench mid-flight restarts that bench's clock. The
          // incoming engineer is not answerable for time before they had it.
          if (assessment && e.createdAt > assessment.startedAt) {
            assessment = { startedAt: e.createdAt, rework: assessment.rework };
          }
          break;

        case "ASSESSMENT_SUBMITTED":
          if (e.actorId) {
            push(
              "assessment",
              e.actorId,
              assessment?.startedAt ?? e.createdAt,
              e.createdAt,
              assessment?.rework ?? false,
              false,
            );
          }
          assessment = null;
          break;

        case "REPAIR_APPROVED":
          repair = { startedAt: e.createdAt, rework: false };
          break;

        case "REPAIR_PROGRESS":
          // Only the READY report closes a repair. The other stages are
          // progress notes on a job that is still running.
          if (repair && e.newValue === READY_LABEL && e.actorId) {
            push("repair", e.actorId, repair.startedAt, e.createdAt, false, false);
            repair = null;
          }
          break;

        case "REGISTRATION_COMPLETED":
          // The next desk took it on, so the repair finished whether or not
          // anyone said so. Credited to the holder, flagged as inferred.
          if (repair && v.assignedEngineerId) {
            push("repair", v.assignedEngineerId, repair.startedAt, e.createdAt, false, true);
          }
          repair = null;
          break;
      }
    }

    // Anything still open is only a live job if the file is actually sitting at
    // the status that job belongs to. A dangling open assessment on a file that
    // has moved on is a replay artefact, not work in hand.
    if (assessment && v.status === "CN_APPROVED" && v.assignedEngineerId) {
      push("assessment", v.assignedEngineerId, assessment.startedAt, null, assessment.rework, false);
    }
    if (repair && v.status === "REPAIR_APPROVED" && v.assignedEngineerId) {
      push("repair", v.assignedEngineerId, repair.startedAt, null, false, false);
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round(v * 10) / 10;
}

const blankKind = (): KindStat => ({ assigned: 0, completed: 0, avgHours: null });

function emptyMonth(key: string): MonthStat {
  return {
    key,
    label: monthLabel(key),
    assigned: 0,
    completed: 0,
    avgHours: null,
    medianHours: null,
    fastest: null,
    slowest: null,
    assessment: blankKind(),
    repair: blankKind(),
    cohortDone: 0,
    reworks: 0,
    onTime: 0,
    late: 0,
    carried: 0,
  };
}

/** Roll a set of jobs up into one month's reading. */
function summariseMonth(key: string, jobs: JobRow[]): MonthStat {
  const start = monthStart(key).getTime();
  const end = monthEnd(key).getTime();

  const landed = jobs.filter((j) => {
    const t = Date.parse(j.startedAt);
    return t >= start && t < end;
  });
  const finished = jobs.filter((j) => {
    if (!j.endedAt) return false;
    const t = Date.parse(j.endedAt);
    return t >= start && t < end;
  });

  const stat = emptyMonth(key);
  stat.assigned = landed.length;
  stat.completed = finished.length;

  const hours = finished.map((j) => j.hours).filter((h): h is number => h !== null);
  stat.avgHours = mean(hours);
  stat.medianHours = median(hours);

  if (finished.length) {
    const byTime = [...finished].sort((a, b) => (a.hours ?? 0) - (b.hours ?? 0));
    const first = byTime[0];
    const last = byTime[byTime.length - 1];
    stat.fastest = { hours: first.hours ?? 0, label: `${first.name} · ${first.registrationNo}` };
    stat.slowest = { hours: last.hours ?? 0, label: `${last.name} · ${last.registrationNo}` };
  }

  for (const kind of ["assessment", "repair"] as const) {
    const k = stat[kind];
    k.assigned = landed.filter((j) => j.kind === kind).length;
    const done = finished.filter((j) => j.kind === kind);
    k.completed = done.length;
    k.avgHours = mean(done.map((j) => j.hours).filter((h): h is number => h !== null));
  }

  stat.cohortDone = landed.filter((j) => j.endedAt !== null).length;
  stat.reworks = landed.filter((j) => j.rework).length;
  stat.onTime = finished.filter((j) => j.onTime === true).length;
  stat.late = finished.filter((j) => j.onTime === false).length;
  stat.carried = jobs.filter((j) => {
    if (Date.parse(j.startedAt) >= end) return false;
    return j.endedAt === null || Date.parse(j.endedAt) >= end;
  }).length;

  return stat;
}

/** The months the picker offers: this month, back HISTORY_MONTHS. */
function pickableMonths(endKey: string): MonthOption[] {
  return monthsBack(HISTORY_MONTHS, endKey).map((key) => ({
    key,
    label: monthLabel(key),
    short: monthShort(key),
    year: Number(key.slice(0, 4)),
  }));
}

/**
 * The window every read shares.
 *
 * The trend always ends at the SELECTED month, so scrubbing back walks the
 * whole twelve-month chart rather than freezing it on today.
 */
function windowFor(selected: string): { months: string[]; since: Date } {
  const months = monthsBack(HISTORY_MONTHS, selected);
  const since = monthStart(shiftMonth(months[0], -LOOKBACK_MONTHS));
  return { months, since };
}

async function roster(): Promise<EngineerRef[]> {
  return prisma.user.findMany({
    where: { role: "SERVICE_ENGINEER", isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, staffId: true },
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** One engineer's own card. Used by their workbench and by the Service Manager. */
export async function getEngineerScorecard(
  engineerId: string,
  month?: string | null,
): Promise<EngineerScorecard> {
  const monthKey = normaliseMonth(month);
  const { months, since } = windowFor(monthKey);

  const [allJobs, team, self] = await Promise.all([
    buildJobs(since),
    roster(),
    prisma.user.findUnique({
      where: { id: engineerId },
      select: { id: true, name: true, staffId: true },
    }),
  ]);

  const mine = allJobs.filter((j) => j.engineerId === engineerId);

  const history = months.map((key) => summariseMonth(key, mine));
  const current = history[history.length - 1];
  const prevKey = shiftMonth(monthKey, -1);
  const previous = history.find((h) => h.key === prevKey) ?? summariseMonth(prevKey, mine);

  // Personal records, read off the same history the chart draws — so a claimed
  // best month is always one the engineer can scrub back to and see.
  const withWork = history.filter((h) => h.completed > 0);
  const bestCompleted = withWork.length
    ? withWork.reduce((a, b) => (b.completed > a.completed ? b : a))
    : null;
  const timed = withWork.filter((h) => h.avgHours !== null);
  const fastestMonth = timed.length
    ? timed.reduce((a, b) => (b.avgHours! < a.avgHours! ? b : a))
    : null;

  const lifetimeDone = mine.filter((j) => j.endedAt !== null);

  // Peer context for the same month. Median rather than mean of peer volume:
  // with five engineers, one exceptional month should not redefine "normal"
  // for everybody else.
  const peerMonths = team
    .filter((t) => t.id !== engineerId)
    .map((t) => summariseMonth(monthKey, allJobs.filter((j) => j.engineerId === t.id)));
  const peerHours = peerMonths.map((p) => p.avgHours).filter((h): h is number => h !== null);

  const ranking = team
    .map((t) => ({
      id: t.id,
      completed: summariseMonth(monthKey, allJobs.filter((j) => j.engineerId === t.id)).completed,
    }))
    .sort((a, b) => b.completed - a.completed);
  const rankIndex = ranking.findIndex((r) => r.id === engineerId);

  return {
    engineer: self ?? { id: engineerId, name: "Engineer", staffId: "—" },
    monthKey,
    months: pickableMonths(monthKeyOf(new Date())),
    current,
    previous,
    history,
    best: {
      completed: bestCompleted ? { key: bestCompleted.key, value: bestCompleted.completed } : null,
      avgHours: fastestMonth ? { key: fastestMonth.key, value: fastestMonth.avgHours! } : null,
    },
    lifetime: {
      completed: lifetimeDone.length,
      avgHours: mean(lifetimeDone.map((j) => j.hours).filter((h): h is number => h !== null)),
    },
    team: {
      avgHours: mean(peerHours),
      medianCompleted: median(peerMonths.map((p) => p.completed)),
      engineers: team.length,
      rank: current.completed > 0 && rankIndex >= 0 ? rankIndex + 1 : null,
    },
    jobs: mine
      .filter((j) => {
        if (!j.endedAt) return false;
        const t = Date.parse(j.endedAt);
        return t >= monthStart(monthKey).getTime() && t < monthEnd(monthKey).getTime();
      })
      .sort((a, b) => Date.parse(b.endedAt!) - Date.parse(a.endedAt!)),
    openNow: mine.filter((j) => j.endedAt === null).length,
  };
}

/** The whole workshop, one row per engineer. The Service Manager's tab. */
export async function getTeamScorecard(month?: string | null): Promise<TeamScorecard> {
  const monthKey = normaliseMonth(month);
  const { months, since } = windowFor(monthKey);

  const [allJobs, team] = await Promise.all([buildJobs(since), roster()]);

  // An engineer since deactivated still did the work, and a month that silently
  // dropped their jobs would not add up against the team total.
  const known = new Set(team.map((t) => t.id));
  const strays = [...new Set(allJobs.map((j) => j.engineerId))].filter((id) => !known.has(id));
  const former = strays.length
    ? await prisma.user.findMany({
        where: { id: { in: strays } },
        select: { id: true, name: true, staffId: true },
      })
    : [];

  const people: EngineerRef[] = [...team, ...former];
  const prevKey = shiftMonth(monthKey, -1);

  const rows: TeamScorecardRow[] = people.map((engineer) => {
    const mine = allJobs.filter((j) => j.engineerId === engineer.id);
    return {
      engineer,
      current: summariseMonth(monthKey, mine),
      previous: summariseMonth(prevKey, mine),
      spark: months.map((key) => {
        const s = summariseMonth(key, mine);
        return { key, completed: s.completed, avgHours: s.avgHours };
      }),
      openNow: mine.filter((j) => j.endedAt === null).length,
    };
  });

  return {
    monthKey,
    months: pickableMonths(monthKeyOf(new Date())),
    rows,
    total: summariseMonth(monthKey, allJobs),
    previousTotal: summariseMonth(prevKey, allJobs),
    history: months.map((key) => summariseMonth(key, allJobs)),
  };
}

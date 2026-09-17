import type {
  AccidentSeverity,
  RecoveryPart,
  CaptureRequestStatus,
  CaseFlagKind,
  CaseFlagStatus,
  LetterStage,
  OffroadCaseStatus,
  OffroadKind,
  ThanaReason,
  VehicleCondition,
  VehicleStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { caseClock } from "@/lib/offroad";
import { letterSchedule, nextAction } from "@/lib/letterSchedule";
import { deriveManagerMetrics } from "@/lib/recoveryRollup";
import type { Posting } from "@/lib/postings";

// The pure derivations — the part filter, the metrics and the territory
// roll-up — live in lib/recoveryRollup.ts, so the Recovery Manager's console
// can run them in the browser without pulling Prisma in with them. Import them
// from there rather than through this module: a re-export would run back
// through the type-only edge that module has on this one, and Turbopack
// refuses to resolve a re-export across that cycle even though TypeScript is
// happy with it.

// ---------------------------------------------------------------------------
// The reads behind the two recovery surfaces
//
// The ARO's phone and the Recovery Manager's console ask the same four
// questions of four different tables — what am I holding, what have I asked
// for, what is off the road, what is late — and they answer them over
// different scopes. Both are assembled here so the two surfaces cannot drift
// into disagreeing about what "overdue" means.
// ---------------------------------------------------------------------------

export interface RequestRow {
  id: string;
  registrationNo: string;
  customerCode: string;
  customerName: string;
  make: string | null;
  model: string | null;
  odNumber: number;
  odAmount: number;
  outstandingAmount: number;
  settlementPossible: boolean;
  remarks: string;
  status: CaptureRequestStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
  vehicleId: string | null;
  /** Who raised it. Carried as an id as well as a name so the desk can roll
   *  the book up by officer without matching on names. */
  requestedById: string;
  requestedBy: { name: string; staffId: string } | null;
  decidedBy: { name: string } | null;
  territory: { name: string; part: RecoveryPart | null } | null;
  /** Whole days this request has been waiting for a decision. */
  ageDays: number;
}

export interface CaseRow {
  id: string;
  kind: OffroadKind;
  status: OffroadCaseStatus;
  registrationNo: string;
  customerCode: string;
  customerName: string;
  make: string | null;
  model: string | null;
  mileage: string | null;
  /** The account position, where the officer had it to hand. */
  odNumber: number | null;
  odAmount: number | null;
  outstandingAmount: number | null;
  occurredAt: Date;
  approxDays: number;
  revisedDays: number | null;
  revisedAt: Date | null;
  revisedBy: { name: string } | null;
  remarks: string;
  accidentSeverity: AccidentSeverity | null;
  accidentNote: string | null;
  vehicleCondition: VehicleCondition | null;
  thanaReason: ThanaReason | null;
  thanaReasonNote: string | null;
  thanaName: string | null;
  vehicleLocation: string | null;
  nocReference: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  vehicleId: string | null;
  /** Who opened it — the id, for rolling the book up by officer. */
  openedById: string;
  openedBy: { name: string; staffId: string } | null;
  territory: { name: string; part: RecoveryPart | null } | null;
  photos: { id: string; url: string; caption: string | null }[];
  flags: FlagRow[];
  /** The derived countdown. Present on every row so no list has to build it. */
  clock: ReturnType<typeof caseClock>;
  /** The open flag of each kind, if any — what each side must act on. */
  openSupport: FlagRow | null;
  openAttention: FlagRow | null;
}

export interface FlagRow {
  id: string;
  kind: CaseFlagKind;
  status: CaseFlagStatus;
  note: string;
  raisedAt: Date;
  raisedBy: { name: string; staffId: string } | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  resolvedBy: { name: string } | null;
  /** Whole days this flag has been waiting. 0 once resolved. */
  ageDays: number;
}

export interface CaptureRow {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  customerName: string;
  /** Optional in the schema: rows imported before the column existed carry a
   *  name and no code, and the heading renders the name alone. */
  customerCode: string | null;
  status: VehicleStatus;
  letterStage: LetterStage;
  isLocked: boolean;
  captureDate: Date;
  /** Field spend on the day of the seizure. Record only — never a cost basis. */
  captureCost: number | null;
  letter1At: Date | null;
  letter2At: Date | null;
  letter3At: Date | null;
  territory: { name: string; part: RecoveryPart | null } | null;
  /** The officer who took it. Null on records captured before the column
   *  existed, and on anything imported rather than seized. */
  capturedById: string | null;
  assignedEngineerId: string | null;
  assignedEngineer: { name: string } | null;
  /** Derived letter ladder — due dates, what is late, whether release is shut. */
  letters: ReturnType<typeof letterSchedule>;
  /**
   * The single thing the officer owes on this file: serve the next letter, or
   * request the Credit Note once the ladder has run. Derived here so the card,
   * the list order and the dashboard's attention count all read the same
   * answer rather than each deriving their own.
   */
  next: ReturnType<typeof nextAction>;
}

const requestSelect = {
  id: true,
  registrationNo: true,
  customerCode: true,
  customerName: true,
  make: true,
  model: true,
  odNumber: true,
  odAmount: true,
  outstandingAmount: true,
  settlementPossible: true,
  remarks: true,
  status: true,
  requestedAt: true,
  decidedAt: true,
  decisionNote: true,
  vehicleId: true,
  requestedById: true,
  requestedBy: { select: { name: true, staffId: true } },
  decidedBy: { select: { name: true } },
  territory: { select: { name: true, part: true } },
} as const;

const caseInclude = {
  openedBy: { select: { name: true, staffId: true } },
  revisedBy: { select: { name: true } },
  // `part` rides along with the name: the field is split into two halves,
  // each with its own manager, and every RM surface has to be filterable
  // down to one of them.
  territory: { select: { name: true, part: true } },
  photos: { select: { id: true, url: true, caption: true } },
  // Every flag, not just the open ones: the card shows what is outstanding at
  // the top and the history behind the disclosure, and a second query for the
  // second half would double the reads on every board.
  flags: {
    orderBy: { raisedAt: "desc" },
    select: {
      id: true,
      kind: true,
      status: true,
      note: true,
      raisedAt: true,
      resolvedAt: true,
      resolutionNote: true,
      raisedBy: { select: { name: true, staffId: true } },
      resolvedBy: { select: { name: true } },
    },
  },
} as const;

const DAY_MS = 86_400_000;

function ageInDays(from: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY_MS));
}

function decorateRequest(r: Omit<RequestRow, "ageDays">, now: Date): RequestRow {
  return { ...r, ageDays: ageInDays(r.requestedAt, now) };
}

function decorateCase(
  c: Omit<CaseRow, "clock" | "openSupport" | "openAttention" | "flags"> & {
    flags: Omit<FlagRow, "ageDays">[];
  },
  now: Date,
): CaseRow {
  const flags: FlagRow[] = c.flags.map((f) => ({
    ...f,
    ageDays: f.status === "OPEN" ? ageInDays(f.raisedAt, now) : 0,
  }));
  const open = (kind: CaseFlagKind) =>
    flags.find((f) => f.kind === kind && f.status === "OPEN") ?? null;

  return {
    ...c,
    flags,
    clock: caseClock(
      { occurredAt: c.occurredAt, approxDays: c.approxDays, revisedDays: c.revisedDays },
      now,
    ),
    openSupport: open("SUPPORT_REQUEST"),
    openAttention: open("ATTENTION"),
  };
}

function decorateCapture(v: Omit<CaptureRow, "letters" | "next">, now: Date): CaptureRow {
  const input = {
    captureDate: v.captureDate,
    letterStage: v.letterStage,
    letter1At: v.letter1At,
    letter2At: v.letter2At,
    letter3At: v.letter3At,
  };
  return {
    ...v,
    letters: letterSchedule(input, now),
    next: nextAction({ ...input, status: v.status }, now),
  };
}

// ---------------------------------------------------------------------------
// The field officer's book
// ---------------------------------------------------------------------------

export interface AroBook {
  captures: CaptureRow[];
  requests: RequestRow[];
  cases: CaseRow[];
  engineers: { id: string; name: string; staffId: string }[];
  totals: {
    totalCaptures: number;
    capturesLast30: number;
    capturesPrior30: number;
  };
}

export async function getAroBook(userId: string): Promise<AroBook> {
  const now = new Date();
  const since30 = new Date(now.getTime() - 30 * DAY_MS);
  const since60 = new Date(now.getTime() - 60 * DAY_MS);

  const [captures, requests, cases, engineers, totalCaptures, last30, prior30] =
    await Promise.all([
      prisma.vehicle.findMany({
        where: { capturedById: userId },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: {
          id: true,
          registrationNo: true,
          make: true,
          model: true,
          customerName: true,
          customerCode: true,
          status: true,
          letterStage: true,
          isLocked: true,
          captureDate: true,
          captureCost: true,
          letter1At: true,
          letter2At: true,
          letter3At: true,
          capturedById: true,
          assignedEngineerId: true,
          territory: { select: { name: true, part: true } },
          assignedEngineer: { select: { name: true } },
        },
      }),
      prisma.captureRequest.findMany({
        where: { requestedById: userId },
        orderBy: { requestedAt: "desc" },
        take: 100,
        select: requestSelect,
      }),
      prisma.offroadCase.findMany({
        where: { openedById: userId },
        orderBy: [{ status: "asc" }, { occurredAt: "asc" }],
        take: 150,
        include: caseInclude,
      }),
      prisma.user.findMany({
        where: { role: "SERVICE_ENGINEER", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, staffId: true },
      }),
      prisma.vehicle.count({ where: { capturedById: userId } }),
      prisma.vehicle.count({
        where: { capturedById: userId, createdAt: { gte: since30 } },
      }),
      prisma.vehicle.count({
        where: { capturedById: userId, createdAt: { gte: since60, lt: since30 } },
      }),
    ]);

  return {
    captures: captures.map((v) => decorateCapture(v, now)),
    requests: requests.map((r) => decorateRequest(r, now)),
    cases: cases.map((c) => decorateCase(c, now)),
    engineers,
    totals: { totalCaptures, capturesLast30: last30, capturesPrior30: prior30 },
  };
}

// ---------------------------------------------------------------------------
// The Recovery Manager's console
// ---------------------------------------------------------------------------

export interface ManagerBook {
  /** Capture requests awaiting a ruling — the desk's actual inbox. */
  pendingRequests: RequestRow[];
  /** Everything decided, most recent first, for context and audit. */
  decidedRequests: RequestRow[];
  openCases: CaseRow[];
  closedCases: CaseRow[];
  /** Captures whose letter ladder has slipped — the desk's other watch. */
  letterWatch: CaptureRow[];
  /**
   * Every capture still inside the eight-desk chain.
   *
   * Wider than `letterWatch`, which is only the ones running late. The
   * territory roll-up needs the whole population — a territory holding twelve
   * captures that are all on schedule is still a territory holding twelve
   * vehicles that are not earning.
   */
  pipelineCaptures: CaptureRow[];
  /**
   * Every serving field officer, whether or not they have anything open.
   *
   * Read separately from the three books because an officer with nothing
   * outstanding does not appear in any of them — and "which of my officers
   * is sitting on nothing" is exactly as much of an answer as "which one is
   * sitting on nine", which is the whole reason the roll-up exists.
   */
  aroRoster: OfficerIdentity[];
  metrics: ManagerMetrics;
}

export interface OfficerIdentity {
  id: string;
  name: string;
  staffId: string;
  isActive: boolean;
  /**
   * Every territory they work, base and cover, each with its half of the field.
   *
   * A list rather than one name and one part, because an officer holding a
   * vacant neighbouring patch works both — and if that patch is across the A/B
   * line they belong to both halves at once. Carried on the roster rather than
   * looked up from it: the roster is the one collection in the book whose rows
   * are people instead of records, so there is no `territory.part` to filter
   * by, and matching an officer to a half by territory NAME would be a join on
   * a string.
   */
  postings: Posting[];
}

export interface ManagerMetrics {
  pendingRequests: number;
  /** Pending and older than two days — the ones costing the field time. */
  agedRequests: number;
  approvalRate: number | null;
  openAccident: number;
  openThana: number;
  overdueCases: number;
  lettersOverdue: number;
  /** Cases whose window the desk has already extended at least once. */
  revisedCases: number;
  /** Officers waiting on the desk for something they cannot do themselves. */
  openSupport: number;
  /** Attention flags the desk has raised that the field has not answered. */
  openAttention: number;
  /**
   * Open cases nobody has touched in a fortnight — no flag, no revision, no
   * outcome. The quiet ones, which is the failure mode a board of countdowns
   * hides: a case can sit inside its window for months and still be forgotten.
   */
  staleCases: number;
}

export async function getManagerBook(): Promise<ManagerBook> {
  const now = new Date();

  const [requests, cases, captures, roster] = await Promise.all([
    prisma.captureRequest.findMany({
      orderBy: { requestedAt: "desc" },
      take: 300,
      select: requestSelect,
    }),
    prisma.offroadCase.findMany({
      orderBy: [{ status: "asc" }, { occurredAt: "asc" }],
      take: 400,
      include: caseInclude,
    }),
    // Every vehicle still inside the chain. The letter ladder is only live
    // while the file is in the field team's hands, so the watch below narrows
    // to CAPTURED — but the territory roll-up counts them all.
    prisma.vehicle.findMany({
      where: { status: { notIn: ["SOLD", "RELEASED"] } },
      orderBy: { captureDate: "asc" },
      take: 300,
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        customerName: true,
        customerCode: true,
        status: true,
        letterStage: true,
        isLocked: true,
        captureDate: true,
        captureCost: true,
        letter1At: true,
        letter2At: true,
        letter3At: true,
        capturedById: true,
        assignedEngineerId: true,
        territory: { select: { name: true, part: true } },
        assignedEngineer: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: "RECOVERY_TEAM", isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        staffId: true,
        isActive: true,
        postings: {
          orderBy: { kind: "asc" },
          select: {
            kind: true,
            territoryId: true,
            territory: { select: { name: true, part: true } },
          },
        },
      },
    }),
  ]);

  const allRequests = requests.map((r) => decorateRequest(r, now));
  const allCases = cases.map((c) => decorateCase(c, now));
  const allCaptures = captures.map((v) => decorateCapture(v, now));

  const pendingRequests = allRequests.filter((r) => r.status === "PENDING");
  const decidedRequests = allRequests.filter((r) => r.status !== "PENDING");
  const openCases = allCases.filter((c) => c.status === "OPEN");
  const closedCases = allCases.filter((c) => c.status !== "OPEN");
  // The ladder only runs while the file is with the field team; a file that
  // has moved on to another desk cannot be "late" for a letter nobody is
  // still expected to send.
  const letterWatch = allCaptures.filter(
    (v) => v.status === "CAPTURED" && v.letters.overdueCount > 0,
  );

  return {
    pendingRequests,
    decidedRequests,
    openCases,
    closedCases,
    letterWatch,
    pipelineCaptures: allCaptures,
    aroRoster: roster.map((u) => ({
      id: u.id,
      name: u.name,
      staffId: u.staffId,
      isActive: u.isActive,
      postings: u.postings,
    })),
    // Derived by the same function the console calls when it narrows this book
    // to one half of the field, so a scoped figure and a national one are the
    // same calculation over a different set of rows.
    metrics: deriveManagerMetrics({
      pendingRequests,
      allRequests,
      openCases,
      letterWatch,
    }),
  };
}

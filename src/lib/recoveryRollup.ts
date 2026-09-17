import type { PostingKind, RecoveryPart } from "@prisma/client";
import { isCaptureStage, isResaleInventory } from "@/lib/status";
import type {
  CaptureRow,
  CaseRow,
  ManagerBook,
  ManagerMetrics,
  OfficerIdentity,
  RequestRow,
} from "@/lib/recoveryDesk";

/**
 * The recovery desk's derivations, with no database under them.
 *
 * Everything here is a pure function over rows that have already been read.
 * It lives apart from lib/recoveryDesk.ts — which imports Prisma — for one
 * reason: the Recovery Manager's console narrows its whole page to one half of
 * the field IN THE BROWSER, from the book it was already sent, and a module
 * that reaches the client cannot drag the database client in with it. Same
 * trap lib/storage.ts documents for `isPdfName`.
 *
 * The important consequence is that the server and the console share these
 * definitions rather than each keeping their own. A scoped figure and a
 * national one are then the same calculation over a different set of rows —
 * which is the only way "Part A" can be trusted to mean the same thing as
 * "Both parts" with a filter applied.
 */

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

/**
 * Which half of the field is being read.
 *
 * The recovery organisation is split in two, each half with its own manager,
 * and above them a head who reads both. A part-wise manager should be able to
 * land on any surface in this panel and narrow it to their own book in one
 * press, and the head should be able to put it back.
 */
export type PartChoice = "all" | RecoveryPart;

/** Does this row's territory belong to the chosen half? */
export function matchesPart(
  part: PartChoice,
  territory: { part: RecoveryPart | null } | null | undefined,
): boolean {
  if (part === "all") return true;
  return territory?.part === part;
}

/**
 * The desk's readings, derived from whatever set of rows it is given.
 *
 * Extracted from `getManagerBook` so the console can recompute every figure
 * against one half of the field without a second definition of what any of
 * them means. The national and the scoped numbers are now literally the same
 * expressions; there is no version of this where they can drift.
 */
export function deriveManagerMetrics(input: {
  /** Requests still awaiting a ruling. */
  pendingRequests: RequestRow[];
  /** Every request, pending or decided — the approval rate needs both. */
  allRequests: RequestRow[];
  openCases: CaseRow[];
  /** Captures whose ladder has slipped. */
  letterWatch: CaptureRow[];
}): ManagerMetrics {
  const { pendingRequests, allRequests, openCases, letterWatch } = input;

  // "Nothing has happened here in a fortnight": no flag either way, no
  // revision, and opened more than 14 days ago. Fourteen because it is long
  // enough that a real case would have produced something and short enough
  // that the desk can still do something about it.
  const stale = openCases.filter(
    (c) => c.clock.elapsedDays >= STALE_DAYS && c.flags.length === 0 && !c.clock.revised,
  );

  // Ruled-on requests only. A withdrawal is the officer changing their mind,
  // not the desk refusing, and counting it as a refusal would make a manager
  // who approves everything look strict.
  const ruled = allRequests.filter(
    (r) => r.status === "APPROVED" || r.status === "DECLINED" || r.status === "CAPTURED",
  );
  const approved = ruled.filter((r) => r.status !== "DECLINED").length;

  return {
    pendingRequests: pendingRequests.length,
    agedRequests: pendingRequests.filter((r) => r.ageDays >= 2).length,
    approvalRate: ruled.length ? Math.round((approved / ruled.length) * 100) : null,
    openAccident: openCases.filter((c) => c.kind === "ACCIDENT").length,
    openThana: openCases.filter((c) => c.kind === "THANA").length,
    overdueCases: openCases.filter((c) => c.clock.overdue).length,
    lettersOverdue: letterWatch.length,
    revisedCases: openCases.filter((c) => c.clock.revised).length,
    openSupport: openCases.filter((c) => c.openSupport).length,
    openAttention: openCases.filter((c) => c.openAttention).length,
    staleCases: stale.length,
  };
}

/**
 * The whole book, narrowed to one half of the field.
 *
 * Every collection is filtered on the territory the record belongs to, and the
 * metrics are then RE-DERIVED from what survives rather than adjusted. That
 * distinction is the whole point: an approval rate for Part A is the rate over
 * Part A's requests, not the national rate with a note attached, and the only
 * way to be sure of that is to compute it the same way from fewer rows.
 *
 * `part === "all"` returns the book untouched — same object, no copying, and
 * no chance of a round trip through the filter changing a national figure.
 */
export function scopeManagerBook(book: ManagerBook, part: PartChoice): ManagerBook {
  if (part === "all") return book;

  const inPart = <T extends { territory: { part: RecoveryPart | null } | null }>(rows: T[]) =>
    rows.filter((r) => matchesPart(part, r.territory));

  const pendingRequests = inPart(book.pendingRequests);
  const decidedRequests = inPart(book.decidedRequests);
  const openCases = inPart(book.openCases);
  const letterWatch = inPart(book.letterWatch);

  return {
    pendingRequests,
    decidedRequests,
    openCases,
    closedCases: inPart(book.closedCases),
    letterWatch,
    pipelineCaptures: inPart(book.pipelineCaptures),
    // An officer belongs to a half if ANY territory they hold does — one
    // covering a vacant patch across the A/B line genuinely works both, and
    // has to appear under either.
    //
    // Their POSTINGS are narrowed too, not just their presence on the roster.
    // Without that, an officer based in Dhaka North and covering Rajshahi
    // dragged Rajshahi into the Part A table and Dhaka North into Part B,
    // because the roll-up seeds a row for every posting it is handed. Each
    // half sees the officer with the patches that belong to that half, which
    // is the only reading in which a part filter means anything.
    aroRoster: book.aroRoster
      .map((o) => ({ ...o, postings: o.postings.filter((p) => p.territory.part === part) }))
      .filter((o) => o.postings.length > 0),
    metrics: deriveManagerMetrics({
      pendingRequests,
      allRequests: [...pendingRequests, ...decidedRequests],
      openCases,
      letterWatch,
    }),
  };
}

// ---------------------------------------------------------------------------
// Territory analytics
//
// The desk's real question is never "how many accident cases are there" — it
// is "where is my problem". A single national count cannot answer that, and
// four separate national counts answer it four times without ever crossing
// them.
//
// So the unit is the territory and the columns are the segments, which is the
// only shape that lets a manager read DOWN a column to rank territories and
// ACROSS a row to see what kind of trouble one is in. Two territories with
// eleven vehicles off the road are not comparable until you can see that one
// is eleven captures moving normally and the other is nine seizures nobody has
// touched in a month.
//
// Every figure is a count of things true right now, plus two derived ages.
// Nothing here is a rate over a period: on a table this small a period rate is
// noise, and the desk already has the approval-rate reading for the one place
// a rate means something.
// ---------------------------------------------------------------------------

export interface TerritoryRow {
  territory: string;
  /**
   * Which half of the field this patch belongs to.
   *
   * Two part-wise managers each run one half and the recovery head reads both,
   * so every surface in this panel has to be narrowable to one of them.
   */
  part: RecoveryPart | null;
  /**
   * The officers working here, and how.
   *
   * A territory is a person as much as it is a map region — this desk's whole
   * follow-up is a phone call, and a row you cannot put a name to is a row you
   * cannot act on.
   *
   * `kind` is what makes an unstaffed patch still readable as unstaffed: an
   * officer COVERING Rajshahi is who to ring about it today, and the fact that
   * nobody is BASED there is the thing that should still be showing up as a
   * gap next month.
   */
  aros: { id: string; name: string; staffId: string; kind: PostingKind }[];
  /** Seized, letters running or Credit Note pending. Still a recovery case. */
  captured: number;
  accident: number;
  thana: number;
  /** The headline: everything still to be recovered, whatever put it there. */
  offroadTotal: number;
  /**
   * Past the Credit Note — assessed, repaired, priced, listed.
   *
   * Deliberately NOT part of `offroadTotal`. It is stock on its way to a sale,
   * not a vehicle anybody is trying to recover, and adding it to the off-road
   * figure told this desk that fifteen trucks needed chasing when they were in
   * a workshop being prepared for a buyer.
   */
  resale: number;
  pendingRequests: number;
  /** Open cases past the window they were opened with. */
  overdue: number;
  /** Captured files whose letter schedule has slipped. */
  lettersLate: number;
  /** Officers waiting on the desk for something. */
  support: number;
  /**
   * What this territory has spent taking vehicles, summed over its live files.
   *
   * Watched here and nowhere else. It is field spend the Recovery Manager
   * signs off, and it is kept out of every cost basis downstream on purpose —
   * see the note on Vehicle.captureCost.
   */
  captureSpend: number;
  /** Mean days off the road across this territory's OPEN cases. */
  avgDays: number | null;
  /** The single longest-running open case. The tail is what hurts. */
  oldestDays: number | null;
  /** Open cases with no flag, no revision and no movement for a fortnight. */
  stale: number;

  /**
   * The two totals the desk actually sorts on.
   *
   * Every exception column on this table belongs to one of two people, and
   * which one decides what the manager does next. `needsYou` is work sitting
   * in this desk's own inbox — rule on the request, answer the flag — and is
   * cleared by doing something at this screen. `needsOfficer` is work the
   * field has not done, and is cleared by ringing them.
   *
   * Splitting them is the difference between "this territory has six problems"
   * and "four of them are mine and two are his".
   */
  needsYou: number;
  needsOfficer: number;

  // ---- Merged in from the territory-wise coverage board -------------------
  //
  // These used to live on their own page. They are the same territories cut
  // the same way, and keeping them apart meant a manager answered "how is this
  // patch doing" from two tables that could disagree. Everything the coverage
  // board showed is here EXCEPT the approved-value column, which is withheld
  // from this desk by design — the Recovery Manager's job ends at the Credit
  // Note and they never set or approve a price.

  /** Where this patch's captured files sit on the notice ladder. */
  letter1: number;
  letter2: number;
  letter3: number;
  written: number;
  /** Captured, ladder not yet started. */
  noLetter: number;
  /** Letter 3 served or written off — release is shut on these. */
  locked: number;
  /** Files still moving through the eight-desk chain. */
  activeFiles: number;
  /** Every vehicle ever attached to this territory that is still on the books. */
  totalFiles: number;
}

export interface TerritoryAnalytics {
  rows: TerritoryRow[];
  total: TerritoryRow;
  /** The largest offroadTotal on the board, for scaling the inline bars. */
  peak: number;
}

const STALE_DAYS = 14;

/**
 * Roll the three tables up by territory.
 *
 * Computed from rows already in memory rather than by nine grouped queries:
 * the console has just read every one of these records to render its boards,
 * and going back to the database to count what is already here would be nine
 * round trips to learn nothing new.
 */
export function summariseByTerritory(
  captures: CaptureRow[],
  cases: CaseRow[],
  requests: RequestRow[],
  roster: OfficerIdentity[] = [],
): TerritoryAnalytics {
  const blank = (territory: string): TerritoryRow => ({
    territory,
    part: null,
    aros: [],
    captured: 0,
    accident: 0,
    thana: 0,
    offroadTotal: 0,
    resale: 0,
    pendingRequests: 0,
    overdue: 0,
    lettersLate: 0,
    support: 0,
    avgDays: null,
    oldestDays: null,
    stale: 0,
    needsYou: 0,
    needsOfficer: 0,
    letter1: 0,
    letter2: 0,
    letter3: 0,
    written: 0,
    noLetter: 0,
    locked: 0,
    activeFiles: 0,
    totalFiles: 0,
    captureSpend: 0,
  });

  const map = new Map<string, TerritoryRow>();
  // Days are accumulated separately because the total row's mean cannot be
  // derived from the per-territory means — that would weight a territory with
  // one case the same as one with forty.
  const days = new Map<string, number[]>();
  const allDays: number[] = [];

  const row = (name: string | null | undefined) => {
    const key = name?.trim() || "Unassigned";
    let r = map.get(key);
    if (!r) {
      r = blank(key);
      map.set(key, r);
      days.set(key, []);
    }
    return { key, r };
  };

  const total = blank("All territories");

  // Seed from the roster first, so a territory with an officer and no open
  // work still gets a row. "Nothing outstanding in Khulna" is a reading; a
  // missing Khulna row is just a gap the manager has to notice for themselves.
  //
  // An officer appears under EVERY territory they hold, base and cover alike —
  // which is the whole point of the change: the manager asking "who do I ring
  // about Rajshahi" gets the person actually working it, not a blank because
  // nobody is permanently posted there.
  for (const o of roster) {
    for (const p of o.postings) {
      const { r } = row(p.territory.name);
      if (r.part === null && p.territory.part) r.part = p.territory.part;
      r.aros.push({ id: o.id, name: o.name, staffId: o.staffId, kind: p.kind });
    }
  }

  for (const v of captures) {
    const { r } = row(v.territory?.name);
    // The part travels with the territory, not with the record, so the first
    // row to mention this patch settles it for the whole row.
    if (r.part === null && v.territory?.part) r.part = v.territory.part;

    r.totalFiles++;
    total.totalFiles++;
    r.activeFiles++;
    total.activeFiles++;
    // Null means the officer did not record a figure, which is not the same as
    // a free capture — it simply adds nothing to the running total.
    if (v.captureCost) {
      r.captureSpend += v.captureCost;
      total.captureSpend += v.captureCost;
    }
    if (v.isLocked) {
      r.locked++;
      total.locked++;
    }

    // The Credit Note is the boundary between a recovery case and stock.
    if (isCaptureStage(v.status)) {
      r.captured++;
      total.captured++;
      // The ladder only means anything while the file is still a recovery
      // case; counting rungs on a vehicle already in a workshop would report
      // notices nobody is waiting on.
      const rung =
        v.letterStage === "WRITTEN"
          ? "written"
          : v.letterStage === "LETTER_3"
            ? "letter3"
            : v.letterStage === "LETTER_2"
              ? "letter2"
              : v.letterStage === "LETTER_1"
                ? "letter1"
                : "noLetter";
      r[rung]++;
      total[rung]++;
    } else if (isResaleInventory(v.status)) {
      r.resale++;
      total.resale++;
    }
    // Only a file still in the field team's hands can be late for a letter.
    if (v.status === "CAPTURED" && v.letters.overdueCount > 0) {
      r.lettersLate++;
      total.lettersLate++;
    }
  }

  for (const c of cases) {
    if (c.status !== "OPEN") continue;
    const { key, r } = row(c.territory?.name);
    if (c.kind === "ACCIDENT") {
      r.accident++;
      total.accident++;
    } else {
      r.thana++;
      total.thana++;
    }
    if (c.clock.overdue) {
      r.overdue++;
      total.overdue++;
    }
    if (c.openSupport) {
      r.support++;
      total.support++;
    }
    if (c.clock.elapsedDays >= STALE_DAYS && c.flags.length === 0 && !c.clock.revised) {
      r.stale++;
      total.stale++;
    }
    days.get(key)!.push(c.clock.elapsedDays);
    allDays.push(c.clock.elapsedDays);
  }

  for (const q of requests) {
    if (q.status !== "PENDING") continue;
    const { r } = row(q.territory?.name);
    r.pendingRequests++;
    total.pendingRequests++;
  }

  const mean = (xs: number[]) =>
    xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;

  const splitOwnership = (r: TerritoryRow) => {
    // Waiting on this desk: a request nobody has ruled on, and an officer who
    // has asked for something and cannot move until they get it.
    r.needsYou = r.pendingRequests + r.support;
    // Waiting on the field: the ladder has slipped, the window has passed, or
    // nothing has happened at all.
    r.needsOfficer = r.lettersLate + r.overdue + r.stale;
  };

  for (const [key, r] of map) {
    const d = days.get(key)!;
    r.offroadTotal = r.captured + r.accident + r.thana;
    r.avgDays = mean(d);
    r.oldestDays = d.length ? Math.max(...d) : null;
    splitOwnership(r);
  }
  total.offroadTotal = total.captured + total.accident + total.thana;
  total.avgDays = mean(allDays);
  total.oldestDays = allDays.length ? Math.max(...allDays) : null;
  splitOwnership(total);

  const rows = [...map.values()].sort((a, b) => b.offroadTotal - a.offroadTotal);

  return {
    rows,
    total,
    peak: rows.reduce((m, r) => Math.max(m, r.offroadTotal), 0),
  };
}

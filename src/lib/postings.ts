import type { PostingKind, RecoveryPart } from "@prisma/client";

/**
 * Where an officer works.
 *
 * `User.territoryId` used to answer this with one column, which could not say
 * the thing that actually happens in this organisation: a territory is left
 * unstaffed and the officer next door picks it up. That is not an edge case to
 * be modelled around — it is how a vacancy is survived until somebody is
 * posted, and until this table existed the only way to record it was to leave
 * the patch showing nobody at all.
 *
 * TWO KINDS, because there are two facts:
 *
 *   BASE    their own patch. Exactly one; it is what "an officer's territory"
 *           means everywhere the product used to say that.
 *   COVER   held while that patch has nobody based in it. Any number.
 *
 * Recording them as one relationship would have made a covered vacancy
 * indistinguishable from a properly staffed patch — the coverage board would
 * show Rajshahi with "an officer" and nothing would ever say it is short one.
 *
 * Pure, and client-safe: no Prisma import, so the admin console and the
 * coverage table can both reason about postings in the browser.
 */

export interface Posting {
  territoryId: string;
  territory: { name: string; part: RecoveryPart | null };
  kind: PostingKind;
}

/** Their own patch, or null for somebody who holds only cover — or nothing. */
export function basePosting<T extends { kind: PostingKind }>(postings: T[]): T | null {
  return postings.find((p) => p.kind === "BASE") ?? null;
}

export function coverPostings<T extends { kind: PostingKind }>(postings: T[]): T[] {
  return postings.filter((p) => p.kind === "COVER");
}

/**
 * Every territory this officer may work, base and cover alike.
 *
 * The list that scopes what they can file against and which capture windows
 * reach them. Base and cover are deliberately NOT distinguished here: the
 * distinction is about staffing, and a vehicle seized on a covered patch is as
 * real as one seized at home.
 */
export function heldTerritoryIds(postings: Posting[]): string[] {
  return postings.map((p) => p.territoryId);
}

/**
 * The halves of the field this officer spans.
 *
 * Usually one. An officer covering a neighbouring patch across the A/B line
 * genuinely belongs to both, and the Recovery Manager's part filter has to
 * show them under either — which is only expressible now that a posting is a
 * row rather than a column.
 */
export function partsHeld(postings: Posting[]): RecoveryPart[] {
  const seen = new Set<RecoveryPart>();
  for (const p of postings) if (p.territory.part) seen.add(p.territory.part);
  return [...seen].sort();
}

/** Does this officer work that territory at all? */
export function holdsTerritory(postings: Posting[], territoryId: string): boolean {
  return postings.some((p) => p.territoryId === territoryId);
}

/**
 * The posting, in a line — "Dhaka North, covering Rajshahi".
 *
 * One phrasing, used by the users table, the capture-window console and the
 * coverage board, so an officer's posting reads the same wherever it appears.
 */
export function postingLine(postings: Posting[]): string {
  const base = basePosting(postings);
  const cover = coverPostings(postings);
  if (!base && cover.length === 0) return "";
  const home = base ? base.territory.name : "No base";
  if (cover.length === 0) return home;
  return `${home}, covering ${cover.map((c) => c.territory.name).join(" and ")}`;
}

// ---------------------------------------------------------------------------
// When a cover has done its job
// ---------------------------------------------------------------------------

/**
 * A cover is SPENT once its territory has an officer based in it again.
 *
 * This is the half of the arrangement nobody remembers. Picking up a vacant
 * patch is a decision somebody makes deliberately; putting it down again is a
 * thing that should have happened weeks ago, when the new officer started, and
 * there has never been anything on any screen that would say so.
 *
 * Deriving it rather than storing it is what makes it reliable: the moment an
 * admin gives Rajshahi a based officer, every cover on Rajshahi becomes spent
 * in the same instant, on every screen, without anyone updating a second
 * record. Nothing is revoked automatically — releasing somebody is a decision,
 * and the console only points at it.
 *
 * Takes the whole roster because the question is about a territory, not about
 * the officer holding the cover.
 */
export interface PostedOfficer {
  id: string;
  name: string;
  staffId: string;
  isActive: boolean;
  postings: Posting[];
}

/** Territory ids that have at least one ACTIVE officer based in them. */
export function basedTerritoryIds(roster: PostedOfficer[]): Set<string> {
  const ids = new Set<string>();
  for (const o of roster) {
    if (!o.isActive) continue;
    const base = basePosting(o.postings);
    if (base) ids.add(base.territoryId);
  }
  return ids;
}

export interface SpentCover {
  officer: { id: string; name: string; staffId: string };
  territoryId: string;
  territoryName: string;
  /** Who is based there now — the reason the cover is spent. */
  basedOfficers: string[];
}

/** Every cover being held over a territory that now has its own officer. */
export function spentCovers(roster: PostedOfficer[]): SpentCover[] {
  const based = basedTerritoryIds(roster);

  const nameFor = (territoryId: string) =>
    roster
      .filter(
        (o) =>
          o.isActive &&
          o.postings.some((p) => p.kind === "BASE" && p.territoryId === territoryId),
      )
      .map((o) => o.name);

  const out: SpentCover[] = [];
  for (const o of roster) {
    if (!o.isActive) continue;
    for (const c of coverPostings(o.postings)) {
      if (!based.has(c.territoryId)) continue;
      out.push({
        officer: { id: o.id, name: o.name, staffId: o.staffId },
        territoryId: c.territoryId,
        territoryName: c.territory.name,
        basedOfficers: nameFor(c.territoryId),
      });
    }
  }
  return out;
}

/**
 * Territories nobody is based in, whether or not somebody is covering them.
 *
 * The other half of the same reading: a covered vacancy is still a vacancy,
 * and the board that reports staffing should say so rather than counting the
 * stand-in as the posting.
 */
export function vacantTerritoryIds(
  allTerritoryIds: string[],
  roster: PostedOfficer[],
): string[] {
  const based = basedTerritoryIds(roster);
  return allTerritoryIds.filter((id) => !based.has(id));
}

// ---------------------------------------------------------------------------
// The invariant
// ---------------------------------------------------------------------------

/**
 * What the users API refuses to write.
 *
 * MySQL has no partial unique index, so "at most one BASE per officer" cannot
 * be a constraint — which makes this the only place it is true. Returns the
 * message to show, or null.
 */
/**
 * Every recovery patch has to sit in a part.
 *
 * Enforced for RECOVERY_TEAM only, and named per patch: "part is required" is
 * unhelpful on a form holding three of them. Part is a property of the
 * territory, so this is really asking the administrator to classify a patch
 * they may have just created — which is exactly the moment they know.
 */
export function partError(
  role: string,
  territoryNames: string[],
  partByName: Map<string, "A" | "B" | null>,
): string | null {
  if (role !== "RECOVERY_TEAM") return null;
  const missing = territoryNames.filter((n) => !partByName.get(n.toLowerCase()));
  if (!missing.length) return null;
  return missing.length === 1
    ? `Choose part A or B for ${missing[0]}.`
    : `Choose part A or B for ${missing.join(", ")}.`;
}

export function postingError(
  role: string,
  territoryIds: string[],
  baseTerritoryId: string | null,
): string | null {
  if (role === "RECOVERY_TEAM" && territoryIds.length === 0) {
    return "A Recovery Team officer needs at least one territory — it is what puts their captures on the coverage table.";
  }
  if (territoryIds.length === 0) return null;
  if (!baseTerritoryId) {
    return "Choose which territory this officer is based in. The rest are recorded as cover.";
  }
  if (!territoryIds.includes(baseTerritoryId)) {
    return "The territory they are based in has to be one of the territories they hold.";
  }
  return null;
}

/**
 * May this person file against that territory?
 *
 * Returns the message to refuse with, or null.
 *
 * The forms only OFFER an officer their own patches (see the capture options
 * route), and that is a courtesy to whoever is filling one in — not a control.
 * A request is a request; the list a browser was handed has no authority over
 * what it later posts. This is where the rule actually holds.
 *
 * SUPER_ADMIN is exempt for the same reason they are offered every territory:
 * they hold no posting, so "one of theirs" is a set with nothing in it, and
 * every administrative entry would be refused.
 */
export function territoryDenied(
  role: string,
  heldTerritoryIds: string[],
  territoryId: string | null | undefined,
): string | null {
  if (role === "SUPER_ADMIN") return null;
  if (!territoryId) return null;
  if (heldTerritoryIds.includes(territoryId)) return null;
  return "That territory is not one of yours. File against your own patch, or ask HQ to assign you the cover.";
}

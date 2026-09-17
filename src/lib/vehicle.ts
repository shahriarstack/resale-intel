// How a record is named in the UI.
//
// TWO PRODUCTS, TWO SUBJECTS. This file holds both and says which is which,
// because they look like the same question and are not:
//
//   THE OPERATIONS PRODUCT IS ABOUT AN ACCOUNT.
//   Everything before a sale is recovery work: a customer has stopped paying,
//   and what an officer, a manager or a desk is handling is that customer's
//   file. The vehicle is the collateral in it. Headed by model, two rows from
//   the same customer read as two unrelated trucks, an officer scans a list
//   for a name and finds load classes, and the one fact every conversation
//   about the file starts with — who this is — is the smallest type on the
//   card. So `accountTitle` heads every list, card and file in the desks and
//   the field panel.
//
//   THE MARKETPLACE IS ABOUT A VEHICLE.
//   Once the Credit Note clears, the customer is gone from the story and a
//   buyer is choosing between trucks. There the customer is not merely
//   secondary, it is none of the reader's business. `vehicleTitle` heads the
//   storefront, and nothing else.
//
// The fleet is Foton and nothing else, so the make carries no signal at all —
// the model, which here is the load class, is what distinguishes one unit from
// another and is what a buyer is actually choosing between. The model is
// therefore the storefront heading, with the make demoted to a secondary chip.

interface Named {
  make?: string | null;
  model?: string | null;
}

/** The heading: model first, falling back to make, then a generic label. */
export function vehicleTitle(v: Named): string {
  const model = v.model?.trim();
  if (model) return model;
  const make = v.make?.trim();
  if (make) return make;
  return "Vehicle";
}

/** The secondary label — the make, unless it is already being used as the heading. */
export function vehicleMake(v: Named): string | null {
  const model = v.model?.trim();
  const make = v.make?.trim();
  if (!make) return null;
  return model ? make : null;
}

/**
 * Where the vehicle is, from either source.
 *
 * A vehicle is either at a place on the master list or somewhere the ARO typed
 * in. Exactly one of the two is set, and every screen that shows a location
 * must fall back the same way — so the fallback lives here rather than being
 * re-written as `?? ` at each of the five call sites.
 */
export function locationName(v: {
  currentLocation?: { name: string } | null;
  currentLocationOther?: string | null;
}): string | null {
  return v.currentLocation?.name ?? v.currentLocationOther?.trim() ?? null;
}

/** Single-line form for dense lists and feeds: "Aumark S · Foton". */
export function vehicleLabel(v: Named): string {
  const make = vehicleMake(v);
  return make ? `${vehicleTitle(v)} · ${make}` : vehicleTitle(v);
}

/**
 * How the vehicle was found, in words.
 *
 * Captured once by the ARO and never revised — unlike VehicleGrade, which is
 * a resale judgement made months later. Kept here beside the other naming
 * helpers so a screen never spells out its own version of these three.
 */
export const CONDITION_LABEL: Record<string, string> = {
  ON_ROAD: "On-road",
  OFF_ROAD: "Off-road",
  ACCIDENT: "Accident",
};

export function conditionLabel(c: string | null | undefined): string | undefined {
  return c ? (CONDITION_LABEL[c] ?? c) : undefined;
}

// ---------------------------------------------------------------------------
// The account — the subject of every operations screen
// ---------------------------------------------------------------------------

interface Accounted {
  customerCode?: string | null;
  customerName?: string | null;
}

/**
 * Who a record is about.
 *
 * Returned as two parts rather than one string because they are typeset
 * differently and truncate differently, and every caller was about to make
 * that decision again:
 *
 *   code  a fixed-width identifier. Mono, tabular, and NEVER cut — "CUS-41…"
 *         identifies nothing, which is the same rule the registration already
 *         follows on these cards.
 *   name  the human half. Truncates, because "Meghna Logis…" is still
 *         unmistakably the right customer.
 *
 * `code` is nullable on purpose: `Vehicle.customerCode` is optional in the
 * schema — rows imported before the column existed have a name and no code —
 * and a heading that renders "null · Meghna Logistics" is worse than one that
 * renders the name alone.
 */
export interface Account {
  code: string | null;
  name: string;
}

export function accountOf(r: Accounted): Account {
  const code = r.customerCode?.trim();
  const name = r.customerName?.trim();
  return { code: code || null, name: name || "Unnamed customer" };
}

/** The heading, as one string — for palettes, aria-labels and exports. */
export function accountTitle(r: Accounted): string {
  const a = accountOf(r);
  return a.code ? `${a.code} · ${a.name}` : a.name;
}

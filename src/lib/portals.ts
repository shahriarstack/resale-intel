import type { PortalAccent, PortalBand, PortalGlyph, PortalModule, VehicleStatus } from "@prisma/client";
import {
  Activity,
  BadgeDollarSign,
  Briefcase,
  Building2,
  ClipboardList,
  Compass,
  Globe,
  LayoutList,
  type LucideIcon,
  Mail,
  Map,
  PieChart,
  ShieldCheck,
  Store,
  TriangleAlert,
  Wallet,
  Wrench,
} from "lucide-react";

/**
 * Portals — the lens model.
 *
 * Everything an admin can grant is described here, once, and both sides read
 * it: the studio builds its controls from these tables, and the member's
 * workspace renders its panels from them. That is the point of putting them in
 * one file rather than writing the list twice — a module added here appears in
 * the studio and on the portal in the same commit, and the sentence describing
 * a portal cannot drift out of agreement with what the portal actually shows.
 *
 * Three axes, and the studio asks them as three questions in this order,
 * because that is the order they constrain each other in:
 *
 *   1. WHAT MAY IT SEE      band + territories — the slice of the fleet
 *   2. WHAT MAY IT OPEN     modules — the panels over that slice
 *   3. HOW MUCH IS LEGIBLE  lenses — which columns of it resolve
 *
 * Scope first is deliberate. Choosing "captures only" makes three of the eight
 * panels inert, and an admin should find that out while choosing the scope
 * rather than after assembling a workspace that renders empty.
 */

// ---------------------------------------------------------------------------
// Lenses — how much of a record resolves
// ---------------------------------------------------------------------------

export type LensKey = "showCosts" | "showCustomer" | "showOffers" | "showPhotos";

export interface LensMeta {
  label: string;
  /** What turning it on actually discloses. Written for someone who will have
   *  to justify the grant, not for someone ticking a box. */
  blurb: string;
  /** What the reader sees while it is off — shown in the studio preview so the
   *  admin can see the redaction rather than be told about it. */
  redactedAs: string;
  icon: LucideIcon;
}

export const PORTAL_LENSES: Record<LensKey, LensMeta> = {
  showCosts: {
    label: "Cost basis",
    blurb:
      "Purchase, repair, registration and SOP — and the margin computed from them. This is the number the desks approve against.",
    redactedAs: "Amounts read Tk ••••",
    icon: Wallet,
  },
  showCustomer: {
    label: "Customer identity",
    blurb:
      "The name and account code on a captured file. Personal data about someone whose vehicle was repossessed.",
    redactedAs: "Names read R•••• H••••",
    icon: ShieldCheck,
  },
  showOffers: {
    label: "Offers",
    blurb:
      "What has been offered on live stock and by whom. Commercially sensitive while a vehicle is still being sold.",
    redactedAs: "Offer counts only, no amounts",
    icon: BadgeDollarSign,
  },
  showPhotos: {
    label: "Evidence photographs",
    blurb: "Capture and handover images. Internal evidence, not marketing material.",
    redactedAs: "Photo counts only",
    icon: ClipboardList,
  },
};

export const LENS_ORDER: LensKey[] = ["showCosts", "showCustomer", "showOffers", "showPhotos"];

// ---------------------------------------------------------------------------
// Band — which book the portal reads
// ---------------------------------------------------------------------------

export interface BandMeta {
  label: string;
  /** One line, in the business's own words. */
  blurb: string;
  statuses: VehicleStatus[] | null;
}

/**
 * The two halves the business already recognises, plus both.
 *
 * Written out as lists rather than derived from `isCaptureStage` /
 * `isResaleInventory` because these go into a Prisma `in` filter, and a
 * predicate cannot be pushed into a query. They must be kept in agreement with
 * lib/status.ts by hand — that file is the definition, this is the same
 * boundary expressed where a query can use it.
 *
 * With one deliberate difference: RESALE includes SOLD, which
 * `isResaleInventory` excludes. That function answers "is this stock we are
 * still carrying", where a sold unit is gone. A portal reading the resale book
 * is asking a historical question — what the book did — and a resale reader
 * who cannot see what anything sold for has been given a lens onto an
 * unfinished story. Margin, in particular, exists only on sold units.
 */
export const BAND_META: Record<PortalBand, BandMeta> = {
  ALL: {
    label: "The whole fleet",
    blurb: "Everything on the books — seized, being prepared, live, sold and released.",
    statuses: null,
  },
  CAPTURE: {
    label: "Captures only",
    blurb: "Seized vehicles with letters running or a Credit Note pending. The recovery book.",
    statuses: ["CAPTURED", "CN_REQUESTED"],
  },
  RESALE: {
    label: "Resale book only",
    blurb:
      "Past the Credit Note — stock being assessed, repaired, priced and sold. Nobody is recovering these.",
    statuses: [
      "CN_APPROVED",
      "COST_SUBMITTED",
      "REPAIR_APPROVED",
      "REGISTRATION_DONE",
      "SOP_ADDED",
      "PRICE_APPROVED",
      "LIVE_FOR_RESALE",
      "SOLD",
    ],
  },
};

export const BAND_ORDER: PortalBand[] = ["ALL", "CAPTURE", "RESALE"];

// ---------------------------------------------------------------------------
// Modules — the panels
// ---------------------------------------------------------------------------

export interface ModuleMeta {
  label: string;
  /** The question a reader opens this panel to answer. The studio leads with
   *  it, because "Sales & Margin" names a report and "What did sold units
   *  fetch against what they cost?" names a reason to grant one. */
  question: string;
  icon: LucideIcon;
  /** A lens without which this panel has nothing to show. */
  needsLens?: LensKey;
  /** Which bands the panel has anything to report in. A panel outside its
   *  bands is not forbidden — it is simply empty, and the studio says so. */
  bands: PortalBand[];
}

export const PORTAL_MODULES: Record<PortalModule, ModuleMeta> = {
  FLEET_REGISTER: {
    label: "Fleet register",
    question: "What do we hold, and where is each one?",
    icon: Store,
    bands: ["ALL", "CAPTURE", "RESALE"],
  },
  RESALE_PIPELINE: {
    label: "Pipeline",
    question: "Where is the book sitting across the eight desks?",
    icon: LayoutList,
    bands: ["ALL", "RESALE"],
  },
  OFFROAD_FLEET: {
    label: "Off-road fleet",
    question: "What is not earning today, and why?",
    icon: TriangleAlert,
    // Off-road cases are not vehicles and carry no VehicleStatus, so the band
    // does not reach them. See the OffroadCase note in the schema.
    bands: ["ALL", "CAPTURE", "RESALE"],
  },
  SALES_MARGIN: {
    label: "Sales & margin",
    question: "What did sold units fetch against what they cost?",
    icon: PieChart,
    needsLens: "showCosts",
    bands: ["ALL", "RESALE"],
  },
  TERRITORY_SPREAD: {
    label: "Territory spread",
    question: "Where is the book concentrated?",
    icon: Map,
    bands: ["ALL", "CAPTURE", "RESALE"],
  },
  REPAIR_WATCH: {
    label: "Repair watch",
    question: "Which repairs are running late against their deadline?",
    icon: Wrench,
    bands: ["ALL", "RESALE"],
  },
  LETTER_LADDER: {
    label: "Letter ladder",
    question: "Where is each capture on the escalation schedule?",
    icon: Mail,
    bands: ["ALL", "CAPTURE"],
  },
  RECENT_ACTIVITY: {
    label: "Recent activity",
    question: "What has changed lately, and who changed it?",
    icon: Activity,
    bands: ["ALL", "CAPTURE", "RESALE"],
  },
};

export const MODULE_ORDER: PortalModule[] = [
  "FLEET_REGISTER",
  "RESALE_PIPELINE",
  "OFFROAD_FLEET",
  "SALES_MARGIN",
  "TERRITORY_SPREAD",
  "REPAIR_WATCH",
  "LETTER_LADDER",
  "RECENT_ACTIVITY",
];

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

/** Each accent names a token pair that already exists in the ramp; portals do
 *  not introduce colour, they borrow it. */
export const ACCENT_META: Record<PortalAccent, { label: string; fill: string; ink: string; soft: string }> = {
  INDIGO: { label: "Indigo", fill: "var(--accent)", ink: "var(--accent-ink)", soft: "var(--accent-soft)" },
  JADE: { label: "Jade", fill: "var(--ok)", ink: "var(--ok-ink)", soft: "var(--ok-soft)" },
  GARNET: { label: "Garnet", fill: "var(--bad)", ink: "var(--bad-ink)", soft: "var(--bad-soft)" },
  OCHRE: { label: "Ochre", fill: "var(--warn)", ink: "var(--warn-ink)", soft: "var(--warn-soft)" },
  TEAL: { label: "Teal", fill: "#0f7d8c", ink: "#0a5a66", soft: "#d6eef1" },
  PLUM: { label: "Plum", fill: "#8a3f8f", ink: "#6a2d6e", soft: "#f2dff3" },
};

export const ACCENT_ORDER: PortalAccent[] = ["INDIGO", "JADE", "GARNET", "OCHRE", "TEAL", "PLUM"];

export const GLYPH_META: Record<PortalGlyph, { label: string; icon: LucideIcon }> = {
  COMPASS: { label: "Compass", icon: Compass },
  CHART: { label: "Chart", icon: PieChart },
  SHIELD: { label: "Shield", icon: ShieldCheck },
  BRIEFCASE: { label: "Briefcase", icon: Briefcase },
  BUILDING: { label: "Building", icon: Building2 },
  GLOBE: { label: "Globe", icon: Globe },
  WALLET: { label: "Wallet", icon: Wallet },
  CLIPBOARD: { label: "Clipboard", icon: ClipboardList },
};

export const GLYPH_ORDER: PortalGlyph[] = [
  "COMPASS",
  "CHART",
  "SHIELD",
  "BRIEFCASE",
  "BUILDING",
  "GLOBE",
  "WALLET",
  "CLIPBOARD",
];

// ---------------------------------------------------------------------------
// The grant
// ---------------------------------------------------------------------------

/** A portal resolved into the shape both the studio and the workspace use. */
export interface PortalGrant {
  id: string;
  name: string;
  purpose: string | null;
  modules: PortalModule[];
  band: PortalBand;
  /** Empty means every territory. */
  territories: { id: string; name: string }[];
  showCosts: boolean;
  showCustomer: boolean;
  showOffers: boolean;
  showPhotos: boolean;
  accent: PortalAccent;
  glyph: PortalGlyph;
  isActive: boolean;
}

/**
 * Read the stored module list back into a typed array.
 *
 * The single place the JSON column is cast. Unknown entries are dropped rather
 * than throwing: a portal composed before a module was renamed should lose
 * that panel, not lock its members out of the ones that still exist.
 */
export function parseModules(value: unknown): PortalModule[] {
  if (!Array.isArray(value)) return [];
  const known = new Set<string>(MODULE_ORDER);
  const seen = new Set<PortalModule>();
  for (const v of value) {
    if (typeof v === "string" && known.has(v)) seen.add(v as PortalModule);
  }
  // Ordered by MODULE_ORDER rather than by what was stored, so two portals
  // with the same panels lay them out the same way.
  return MODULE_ORDER.filter((m) => seen.has(m));
}

export function hasModule(grant: PortalGrant, m: PortalModule): boolean {
  return grant.modules.includes(m);
}

/** The statuses a portal may read, or null for every status. */
export function statusesForBand(band: PortalBand): VehicleStatus[] | null {
  return BAND_META[band].statuses;
}

/**
 * The scope, as a `where` fragment.
 *
 * ONE function, used by every panel that reads vehicles. The alternative —
 * each panel composing its own filter — is how a read-only grant springs a
 * leak: seven panels get it right and the eighth forgets the territory clause.
 * Panels add their own conditions alongside this, never instead of it.
 */
export function portalVehicleWhere(grant: PortalGrant): {
  status?: { in: VehicleStatus[] };
  territoryId?: { in: string[] };
} {
  const where: { status?: { in: VehicleStatus[] }; territoryId?: { in: string[] } } = {};
  const statuses = statusesForBand(grant.band);
  if (statuses) where.status = { in: statuses };
  if (grant.territories.length > 0) {
    where.territoryId = { in: grant.territories.map((t) => t.id) };
  }
  return where;
}

/** The same scope for off-road cases, which carry a territory but no status. */
export function portalCaseWhere(grant: PortalGrant): { territoryId?: { in: string[] } } {
  if (grant.territories.length === 0) return {};
  return { territoryId: { in: grant.territories.map((t) => t.id) } };
}

// ---------------------------------------------------------------------------
// Why a panel is empty
// ---------------------------------------------------------------------------

/**
 * The reason a granted module will show nothing, or null if it will.
 *
 * Returned to the studio as a warning and to the workspace as the panel's
 * empty state, so the reader is told the same thing the admin was: the panel
 * is not broken, it is outside this portal's scope.
 */
export function moduleInertReason(m: PortalModule, grant: PortalGrant): string | null {
  const meta = PORTAL_MODULES[m];
  if (meta.needsLens && !grant[meta.needsLens]) {
    return `Needs the ${PORTAL_LENSES[meta.needsLens].label.toLowerCase()} lens — without it there is nothing to report.`;
  }
  if (!meta.bands.includes(grant.band)) {
    return grant.band === "CAPTURE"
      ? "Nothing to show on captures — this happens after the Credit Note."
      : "Nothing to show on the resale book — this happens before the Credit Note.";
  }
  return null;
}

/** The modules that will actually render something under this grant. */
export function liveModules(grant: PortalGrant): PortalModule[] {
  return grant.modules.filter((m) => moduleInertReason(m, grant) === null);
}

// ---------------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------------

function listPhrase(items: string[], max = 3): string {
  if (items.length === 0) return "";
  if (items.length <= max) {
    if (items.length === 1) return items[0];
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }
  return `${items.slice(0, max).join(", ")} and ${items.length - max} more`;
}

/**
 * What this portal is, in one sentence of English.
 *
 * It writes itself from the grant and updates as the admin composes, which is
 * the whole reason it exists: a checklist of sixteen toggles does not tell
 * anyone what they have built, and a sentence does. It is also the thing the
 * admin reads back when asked, a year later, what a portal was for.
 */
export function describePortal(grant: PortalGrant): string {
  const live = liveModules(grant);
  const where =
    grant.territories.length === 0
      ? "every territory"
      : listPhrase(grant.territories.map((t) => t.name));

  const book =
    grant.band === "ALL"
      ? "the whole fleet"
      : grant.band === "CAPTURE"
        ? "the recovery book"
        : "the resale book";

  const panels =
    live.length === 0
      ? "no panels yet"
      : `${live.length} panel${live.length === 1 ? "" : "s"}`;

  const open = LENS_ORDER.filter((k) => grant[k]);
  const named = listPhrase(open.map((k) => PORTAL_LENSES[k].label.toLowerCase()));
  const lenses =
    open.length === 0
      ? "Every amount, name, offer and photograph is masked."
      : open.length === LENS_ORDER.length
        ? "Every field resolves."
        // The clause opens a sentence, so it is capitalised here rather than
        // in the label — the labels are also rendered mid-line on the lens
        // rows, where a capital would be wrong.
        : `${named.charAt(0).toUpperCase()}${named.slice(1)} visible; the rest masked.`;

  return `Reads ${book} across ${where}, through ${panels}. ${lenses}`;
}

/** The same information as chips, for where a sentence is too long. */
export function portalFacets(grant: PortalGrant): { label: string; value: string }[] {
  const live = liveModules(grant);
  return [
    { label: "Book", value: BAND_META[grant.band].label },
    {
      label: "Territories",
      value: grant.territories.length === 0 ? "All" : String(grant.territories.length),
    },
    { label: "Panels", value: `${live.length} of ${MODULE_ORDER.length}` },
    { label: "Lenses", value: `${LENS_ORDER.filter((k) => grant[k]).length} of ${LENS_ORDER.length}` },
  ];
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Masking, not omission.
 *
 * A hidden column is left in place showing a mask rather than removed, and the
 * difference matters to whoever is reading: a register with no cost column
 * looks like a register of vehicles that cost nothing, and one with a masked
 * cost column looks like exactly what it is — a reader who is not cleared for
 * that figure. The same argument applies to a name.
 *
 * The boundary itself is in lib/portalDesk.ts, not here. Every loader masks
 * before it returns, so a masked value is the only one that ever reaches the
 * page — a component is handed `null` for a figure it may not show and the
 * mask for a name, and cannot leak what it was never given. These helpers
 * shape that mask; they do not enforce it.
 */
export const MASK = "••••";

/** "Rakib Hasan" → "R•••• H••••". Keeps the shape of a name without being one. */
export function maskName(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => (w ? `${w[0]}${MASK}` : ""))
      .join(" ") || MASK
  );
}

export function lensCount(grant: PortalGrant): number {
  return LENS_ORDER.filter((k) => grant[k]).length;
}

// ---------------------------------------------------------------------------
// The pairing rule
// ---------------------------------------------------------------------------

/**
 * A portal viewer and their portal are one decision, not two.
 *
 * Both directions are refused, and both matter:
 *
 *   a PORTAL_VIEWER with no portal   can sign in and see nothing, with no way
 *                                    to tell whether that is the grant or a
 *                                    fault
 *   a portal on any other role       stores a lens nothing will ever read,
 *                                    which then reads like access somebody has
 *                                    when they do not
 *
 * A function rather than a schema rule because on an edit the role and the
 * portal can each arrive alone, and what has to hold is the state AFTER the
 * merge. The user form calls it too, so the message a Super Admin reads is
 * written once.
 */
export function portalPairingError(role: string, portalId: string | null): string | null {
  if (role === "PORTAL_VIEWER" && !portalId) {
    return "A portal viewer needs a portal — that is the only thing that decides what they can see.";
  }
  if (role !== "PORTAL_VIEWER" && portalId) {
    return "Only a portal viewer reads through a portal. Change the role, or clear the portal.";
  }
  return null;
}

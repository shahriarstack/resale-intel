import type { Role } from "@prisma/client";
import {
  AlertTriangle,
  Gavel,
  Layers,
  type LucideIcon,
  PackageCheck,
  Shield,
  Store,
  Truck,
  TriangleAlert,
  Wrench,
} from "lucide-react";

/**
 * The data room — raw CSV, by category.
 *
 * One catalogue, read by three things: the picker, the manifest that says what
 * a download will contain before it is taken, and the route that writes the
 * file. The point of putting it here rather than writing the list three times
 * is that the manifest cannot promise a column the file does not carry.
 *
 * TWO IDEAS DO THE WORK.
 *
 * 1. OFF THE ROAD IS A UNION, NOT A TABLE. The business question "what is not
 *    earning today" spans a `Vehicle` that has been seized and an `OffroadCase`
 *    opened for an accident or a police seizure. Those are deliberately
 *    different records — see the OffroadCase note in the schema — and to the
 *    person asking the question they are the same thing. So the off-road
 *    datasets share ONE row shape, with a `Kind` column saying which table a
 *    row came from, and every other column answered from whichever source has
 *    it. A capture's account position comes from its capture request; a case
 *    carries its own. Same columns, two origins.
 *
 * 2. COLUMNS ARE GATED, DATASETS ARE NOT. All five desks that can reach this
 *    page can take any category — what changes is how many columns come with
 *    it. The resale money columns follow the rule the rest of the product
 *    already applies: the Recovery Manager's job ends at the Credit Note, so
 *    the cost basis and the price of a resale unit are not theirs to read (the
 *    coverage board draws the same line). They are told which columns were
 *    withheld rather than handed a file that quietly has fewer, because a
 *    finance reader who knows a column is missing asks for it and one who does
 *    not assumes the figure is zero.
 */

// ---------------------------------------------------------------------------
// Who
// ---------------------------------------------------------------------------

/** The desks that can open the data room at all. */
export const EXPORT_ROLES: Role[] = [
  "SUPER_ADMIN",
  "RECOVERY_MANAGER",
  "SR_EXECUTIVE",
  "AGM_DGM",
  "GM_SR_GM",
];

/**
 * Who may take the resale money columns — cost basis, approved price, margin,
 * offer amounts.
 *
 * The four desks that set or oversee one of those numbers. The Recovery
 * Manager is deliberately absent and it is not an oversight: they rule on the
 * Credit Note and their involvement ends there, so what a vehicle later cost to
 * refurbish and what it fetched are not figures they own. Same list the
 * coverage board uses for the approved-value column, plus the Business Head,
 * who carries the whole book.
 */
export const RESALE_MONEY_ROLES: Role[] = [
  "SUPER_ADMIN",
  "SR_EXECUTIVE",
  "AGM_DGM",
  "GM_SR_GM",
];

export function canExport(role: Role): boolean {
  return EXPORT_ROLES.includes(role);
}

export function canTakeResaleMoney(role: Role): boolean {
  return RESALE_MONEY_ROLES.includes(role);
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export interface Column {
  /** Matches the key the row builder emits. */
  key: string;
  label: string;
  /** Carries resale money, so it is withheld from a desk that may not read it. */
  money?: boolean;
  /** Excel should total this, so it must go out as a bare number. */
  numeric?: boolean;
}

/** The columns this role actually gets, in order. */
export function columnsFor(dataset: DatasetKey, role: Role): Column[] {
  const all = DATASETS[dataset].columns;
  if (canTakeResaleMoney(role)) return all;
  return all.filter((c) => !c.money);
}

/** The columns this role does NOT get — named on the manifest, not hidden. */
export function withheldFor(dataset: DatasetKey, role: Role): Column[] {
  if (canTakeResaleMoney(role)) return [];
  return DATASETS[dataset].columns.filter((c) => c.money);
}

// The union shape. Every off-road dataset uses it, so a capture and an accident
// case can be read down the same columns and compared.
const OFFROAD_COLUMNS: Column[] = [
  { key: "kind", label: "Kind" },
  { key: "reference", label: "Registration No" },
  { key: "customerCode", label: "Customer Code" },
  { key: "customer", label: "Customer" },
  { key: "make", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "territory", label: "Territory" },
  { key: "offRoadSince", label: "Off Road Since" },
  { key: "daysOffRoad", label: "Days Off Road", numeric: true },
  { key: "state", label: "State" },
  { key: "detail", label: "Detail" },
  { key: "location", label: "Location" },
  { key: "expectedBack", label: "Expected Back" },
  { key: "odNumber", label: "OD Number", numeric: true },
  { key: "odAmount", label: "OD Amount", numeric: true },
  { key: "outstanding", label: "Outstanding", numeric: true },
  { key: "owner", label: "Opened By" },
  { key: "ownerStaffId", label: "Opened By Staff ID" },
  { key: "recordId", label: "Record ID" },
];

// The resale shape. Everything from the Credit Note onwards.
const RESALE_COLUMNS: Column[] = [
  { key: "reference", label: "Registration No" },
  { key: "customerCode", label: "Customer Code" },
  { key: "customer", label: "Customer" },
  { key: "make", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "year", label: "Year", numeric: true },
  { key: "mileage", label: "Mileage" },
  { key: "status", label: "Status" },
  { key: "grade", label: "Grade" },
  { key: "asIs", label: "Sold As Is" },
  { key: "territory", label: "Territory" },
  { key: "location", label: "Current Location" },
  { key: "engineer", label: "Engineer" },
  { key: "captureDate", label: "Capture Date" },
  { key: "repairDeadline", label: "Repair Deadline" },
  { key: "repair", label: "Repair Cost", money: true, numeric: true },
  { key: "transport", label: "Transport", money: true, numeric: true },
  { key: "other", label: "Other", money: true, numeric: true },
  { key: "registration", label: "Registration Cost", money: true, numeric: true },
  { key: "sop", label: "SOP", money: true, numeric: true },
  { key: "dealerCommission", label: "Dealer Commission", money: true, numeric: true },
  { key: "totalCost", label: "Total Cost", money: true, numeric: true },
  { key: "approvedPrice", label: "Approved Price", money: true, numeric: true },
  { key: "margin", label: "Margin", money: true, numeric: true },
  { key: "marginPct", label: "Margin %", money: true, numeric: true },
  { key: "offerCount", label: "Offers", numeric: true },
  { key: "topOffer", label: "Top Offer", money: true, numeric: true },
  { key: "soldAt", label: "Sold" },
  { key: "recordId", label: "Record ID" },
];

const REQUEST_COLUMNS: Column[] = [
  { key: "reference", label: "Registration No" },
  { key: "customerCode", label: "Customer Code" },
  { key: "customer", label: "Customer" },
  { key: "make", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "territory", label: "Territory" },
  { key: "state", label: "Decision" },
  { key: "odNumber", label: "OD Number", numeric: true },
  { key: "odAmount", label: "OD Amount", numeric: true },
  { key: "outstanding", label: "Outstanding", numeric: true },
  { key: "settlementPossible", label: "Settlement Possible" },
  { key: "requestedAt", label: "Requested" },
  { key: "requestedBy", label: "Requested By" },
  { key: "decidedAt", label: "Decided" },
  { key: "decidedBy", label: "Decided By" },
  { key: "decisionNote", label: "Decision Note" },
  { key: "becameVehicle", label: "Became A Capture" },
  { key: "recordId", label: "Record ID" },
];

const OFFER_COLUMNS: Column[] = [
  { key: "reference", label: "Registration No" },
  { key: "make", label: "Brand" },
  { key: "model", label: "Model" },
  { key: "status", label: "Vehicle Status" },
  { key: "territory", label: "Territory" },
  { key: "customer", label: "Offer From" },
  { key: "amount", label: "Offer Amount", money: true, numeric: true },
  { key: "approvedPrice", label: "Approved Price", money: true, numeric: true },
  { key: "broughtBy", label: "Brought By" },
  { key: "broughtByRole", label: "Brought By Desk" },
  { key: "salesOfficer", label: "Credited Sales Officer" },
  { key: "state", label: "Offer State" },
  { key: "createdAt", label: "Submitted" },
  { key: "revisedAt", label: "Revised" },
  { key: "note", label: "Remarks" },
  { key: "recordId", label: "Record ID" },
];

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

export type DatasetKey =
  | "OFFROAD_ALL"
  | "OFFROAD_CAPTURES"
  | "OFFROAD_ACCIDENTS"
  | "OFFROAD_THANA"
  | "RESALE_ALL"
  | "RESALE_IN_PROCESS"
  | "RESALE_LIVE"
  | "RESALE_SOLD"
  | "VEHICLES_ALL"
  | "CAPTURE_REQUESTS"
  | "OFFERS";

export type Band = "offroad" | "resale" | "other";

export const BAND_LABEL: Record<Band, string> = {
  offroad: "Off the road",
  resale: "The resale book",
  other: "Everything else",
};

export const BAND_NOTE: Record<Band, string> = {
  offroad:
    "Vehicles that are not earning. Captures and cases in one shape, so they can be read together.",
  resale: "Past the Credit Note — stock being prepared, listed, and what it fetched.",
  other: "The ledgers either side of the pipeline.",
};

export const BAND_ORDER: Band[] = ["offroad", "resale", "other"];

export interface DatasetMeta {
  label: string;
  /** The question somebody opens this file to answer. */
  question: string;
  /**
   * Exactly what is in it, including what is deliberately left out. This is the
   * line that stops a category being misread, so it states the rule rather than
   * summarising it.
   */
  counts: string;
  band: Band;
  icon: LucideIcon;
  /** What the date filter filters on, named as the reader thinks of it. */
  dateLabel: string;
  columns: Column[];
  /** Slug used in the filename. */
  slug: string;
}

export const DATASETS: Record<DatasetKey, DatasetMeta> = {
  // ---- Off the road ----
  OFFROAD_ALL: {
    label: "Everything off the road",
    question: "What is not earning today, whatever put it there?",
    counts:
      "Captures with letters running or a Credit Note pending, plus every open accident and police-custody case. Resale inventory is deliberately excluded — nobody is recovering a truck that is being repainted for sale.",
    band: "offroad",
    icon: TriangleAlert,
    dateLabel: "Off-road date",
    columns: OFFROAD_COLUMNS,
    slug: "offroad-all",
  },
  OFFROAD_CAPTURES: {
    label: "Captures",
    question: "What have we seized and not yet written off?",
    counts:
      "Vehicles at CAPTURED or CN_REQUESTED. The account position comes from the capture request that authorised each one, where there is one.",
    band: "offroad",
    icon: Truck,
    dateLabel: "Capture date",
    columns: OFFROAD_COLUMNS,
    slug: "captures",
  },
  OFFROAD_ACCIDENTS: {
    label: "Accident cases",
    question: "What is off the road damaged, and for how long?",
    counts: "Open accident cases. Resolved ones are excluded.",
    band: "offroad",
    icon: AlertTriangle,
    dateLabel: "Accident date",
    columns: OFFROAD_COLUMNS,
    slug: "accidents",
  },
  OFFROAD_THANA: {
    label: "Police custody",
    question: "What is being held, by whom, and since when?",
    counts: "Open Thana cases. Released ones are excluded.",
    band: "offroad",
    icon: Shield,
    dateLabel: "Seizure date",
    columns: OFFROAD_COLUMNS,
    slug: "thana",
  },

  // ---- The resale book ----
  RESALE_IN_PROCESS: {
    label: "Resale in process",
    question: "What is being prepared for sale, and where has it got to?",
    counts:
      "Credit Note approved through to price approved — assessed, repaired, registered, priced. Not yet listed, not yet sold.",
    band: "resale",
    icon: Wrench,
    dateLabel: "Capture date",
    columns: RESALE_COLUMNS,
    slug: "resale-in-process",
  },
  RESALE_LIVE: {
    label: "Live for resale",
    question: "What is on the marketplace right now?",
    counts: "Listed and biddable. Includes units on hold pending a monthly re-price.",
    band: "resale",
    icon: Store,
    dateLabel: "Capture date",
    columns: RESALE_COLUMNS,
    slug: "live",
  },
  RESALE_SOLD: {
    label: "Resold",
    question: "What did we sell, and what did it fetch against what it cost?",
    counts:
      "Vehicles awarded to a winning offer. Carries the realised price and the margin over the full cost basis.",
    band: "resale",
    icon: PackageCheck,
    dateLabel: "Sold date",
    columns: RESALE_COLUMNS,
    slug: "resold",
  },
  RESALE_ALL: {
    label: "The whole resale book",
    question: "Everything past the Credit Note, in one file.",
    counts:
      "In process, live and sold together — every vehicle whose write-off was authorised, whatever has happened to it since.",
    band: "resale",
    icon: Layers,
    dateLabel: "Capture date",
    columns: RESALE_COLUMNS,
    slug: "resale-book",
  },

  // ---- Everything else ----
  VEHICLES_ALL: {
    label: "Every vehicle",
    question: "The complete register, whatever state each file is in.",
    counts: "Every vehicle ever captured, including released and sold.",
    band: "other",
    icon: Layers,
    dateLabel: "Capture date",
    columns: RESALE_COLUMNS,
    slug: "all-vehicles",
  },
  CAPTURE_REQUESTS: {
    label: "Capture requests",
    question: "What was asked for, what was ruled, and what came of it?",
    counts:
      "The pre-approval ledger — every request, its account position, the manager's decision, and whether it became a capture.",
    band: "other",
    icon: Truck,
    dateLabel: "Requested date",
    columns: REQUEST_COLUMNS,
    slug: "capture-requests",
  },
  OFFERS: {
    label: "Customer offers",
    question: "What has been offered, by whom, on what?",
    counts:
      "Every offer on every vehicle, including revised and withdrawn ones. Offers are made on a customer's behalf, so several from one officer on one vehicle is normal.",
    band: "other",
    icon: Gavel,
    dateLabel: "Submitted date",
    columns: OFFER_COLUMNS,
    slug: "offers",
  },
};

export const DATASET_ORDER: DatasetKey[] = [
  "OFFROAD_ALL",
  "OFFROAD_CAPTURES",
  "OFFROAD_ACCIDENTS",
  "OFFROAD_THANA",
  "RESALE_IN_PROCESS",
  "RESALE_LIVE",
  "RESALE_SOLD",
  "RESALE_ALL",
  "VEHICLES_ALL",
  "CAPTURE_REQUESTS",
  "OFFERS",
];

export function isDatasetKey(v: string): v is DatasetKey {
  return v in DATASETS;
}

// ---------------------------------------------------------------------------
// The filename
// ---------------------------------------------------------------------------

/**
 * A filename that describes its own contents.
 *
 * Three exports of the same category, taken on the same day with different
 * territory filters, land in one downloads folder — so the name carries the
 * category, the date, and the row count. The count is what makes two otherwise
 * identical names distinguishable, and it is also the first thing that tells
 * somebody a file is not what they expected.
 */
export function exportFilename(
  dataset: DatasetKey,
  rows: number,
  date: string,
  scope?: string | null,
): string {
  const bits = ["resale-intel", DATASETS[dataset].slug];
  if (scope) bits.push(scope.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  bits.push(date, `${rows}-rows`);
  return `${bits.join("_")}.csv`;
}

import type { LetterStage, VehicleStatus } from "@prisma/client";
import type { Action } from "@/lib/rbac";
import type { SlaLevel } from "@/lib/sla";

/**
 * The record shape every desk workspace renders.
 *
 * This is deliberately the same shape the previous DeskInbox took, so the
 * eight dashboard branches that feed it did not have to change. New optional
 * fields are additive.
 */
export interface WorkspaceVehicle {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  customerName: string;
  letterStage: LetterStage;
  status: VehicleStatus;
  createdAt: string | Date;
  capturedBy: { name: string } | null;
  assignedEngineer: { name: string } | null;
  territory: { name: string } | null;
  totalCost?: number | null;
  /** Present once a repair has been approved; drives overdue detection. */
  repairDeadline?: string | Date | null;
}

export type Column = "letter" | "engineer" | "territory" | "cost";

export type SortKey = "vehicle" | "reg" | "customer" | "cost" | "date" | "sla";
export type SortDir = "asc" | "desc";

export type Density = "comfortable" | "compact";

/** Module-level so the persistence hook sees a stable reference. */
export const DENSITIES = ["comfortable", "compact"] as const;

/** A quick action offered on rows, in bulk, and in the detail pane. */
export interface QuickAction {
  action: Action;
  label: string;
  short: string;
  tone: "primary" | "ok" | "danger";
  requiresNote?: boolean;
  detail?: string;
}

/**
 * A saved view is a named filter over the desk. Views are per role and per
 * browser, held in localStorage — they are a personal working preference, not
 * business data, so putting them in the database would be the wrong home.
 */
export interface SavedView {
  id: string;
  name: string;
  /** Free-text search applied by the view. */
  search: string;
  /** Restrict to these SLA levels; empty means all. */
  sla: SlaLevel[];
  /** Restrict to these letter stages; empty means all. */
  letters: LetterStage[];
  /** Restrict to these territory names; empty means all. */
  territories: string[];
  /** Capture window, YYYY-MM-DD. Empty string means unbounded on that end. */
  from: string;
  to: string;
  sortKey: SortKey;
  sortDir: SortDir;
  /** Built-in views ship with the app and cannot be deleted or renamed. */
  builtin?: boolean;
}

export interface FilterState {
  search: string;
  sla: SlaLevel[];
  letters: LetterStage[];
  territories: string[];
  from: string;
  to: string;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const EMPTY_FILTER: FilterState = {
  search: "",
  sla: [],
  letters: [],
  territories: [],
  from: "",
  to: "",
  sortKey: "sla",
  sortDir: "desc",
};

/**
 * Apply a saved view's shape over the current filter.
 *
 * Views saved before territory and date existed have neither key, so each is
 * defaulted rather than read straight through — an older view must not come
 * back as `undefined` and crash the list it is meant to narrow.
 */
export function normaliseView(v: SavedView): SavedView {
  return {
    ...v,
    territories: v.territories ?? [],
    from: v.from ?? "",
    to: v.to ?? "",
  };
}

/**
 * Views every desk gets for free. "Needs attention" is the one that earns its
 * place — it is the reason a desk owner opens the app at all.
 */
export const BUILTIN_VIEWS: SavedView[] = [
  {
    id: "all",
    name: "All files",
    search: "",
    sla: [],
    letters: [],
    territories: [],
    from: "",
    to: "",
    sortKey: "sla",
    sortDir: "desc",
    builtin: true,
  },
  {
    id: "attention",
    name: "Needs attention",
    search: "",
    sla: ["risk", "breach"],
    letters: [],
    territories: [],
    from: "",
    to: "",
    sortKey: "sla",
    sortDir: "desc",
    builtin: true,
  },
  {
    id: "newest",
    name: "Just arrived",
    search: "",
    sla: [],
    letters: [],
    territories: [],
    from: "",
    to: "",
    sortKey: "date",
    sortDir: "desc",
    builtin: true,
  },
];

export function viewToFilter(v: SavedView): FilterState {
  const n = normaliseView(v);
  return {
    search: n.search,
    sla: n.sla,
    letters: n.letters,
    territories: n.territories,
    from: n.from,
    to: n.to,
    sortKey: n.sortKey,
    sortDir: n.sortDir,
  };
}

/** True when the live filter still matches the view it was loaded from. */
export function filterMatchesView(f: FilterState, v: SavedView): boolean {
  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join() === [...b].sort().join();
  const n = normaliseView(v);
  return (
    f.search.trim() === n.search.trim() &&
    sameSet(f.sla, n.sla) &&
    sameSet(f.letters, n.letters) &&
    sameSet(f.territories, n.territories) &&
    f.from === n.from &&
    f.to === n.to &&
    f.sortKey === n.sortKey &&
    f.sortDir === n.sortDir
  );
}

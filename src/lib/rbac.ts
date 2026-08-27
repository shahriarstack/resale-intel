import type { Role, VehicleStatus, LetterStage, EventType } from "@prisma/client";

// ---------------------------------------------------------------------------
// Roles — presentation metadata + which surface each role is built for.
// ---------------------------------------------------------------------------

export type Surface = "mobile" | "desktop";

export interface RoleMeta {
  label: string;
  short: string;
  designations: string;
  surface: Surface;
  /** Where this role lands after login. */
  home: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  SUPER_ADMIN: {
    label: "Super Admin",
    short: "Admin",
    designations: "—",
    surface: "desktop",
    home: "/dashboard",
  },
  RECOVERY_TEAM: {
    label: "Recovery Team",
    short: "Recovery",
    designations: "ARO / Sr. ARO",
    surface: "mobile",
    home: "/dashboard",
  },
  RECOVERY_MANAGER: {
    label: "Recovery Manager",
    short: "Recovery Mgr",
    designations: "DM / AM",
    surface: "desktop",
    home: "/dashboard",
  },
  SERVICE_ENGINEER: {
    label: "Service Engineer",
    short: "Engineer",
    designations: "SE / Sr. SE",
    surface: "mobile",
    home: "/dashboard",
  },
  SERVICE_HEAD: {
    label: "Service Head",
    short: "Svc Head",
    designations: "HQ",
    surface: "desktop",
    home: "/dashboard",
  },
  REGISTRATION_TEAM: {
    label: "Registration Team",
    short: "Registration",
    designations: "LO / Sr. LO / AM",
    surface: "desktop",
    home: "/dashboard",
  },
  SR_EXECUTIVE: {
    label: "Sr. Executive",
    short: "Sr. Ex",
    designations: "Sr. Ex",
    surface: "desktop",
    home: "/dashboard",
  },
  AGM_DGM: {
    label: "AGM / DGM",
    short: "AGM/DGM",
    designations: "AGM / DGM",
    surface: "desktop",
    home: "/dashboard",
  },
  GM_SR_GM: {
    label: "General Manager",
    short: "GM",
    designations: "GM / Sr. GM",
    surface: "desktop",
    home: "/dashboard",
  },
  SALES_TEAM: {
    label: "Sales Team",
    short: "Sales",
    designations: "MO / Sr. MO / TM / Sr. TM / AM",
    surface: "mobile",
    home: "/register",
  },
};

export const ALL_ROLES = Object.keys(ROLE_META) as Role[];

export function isMobileRole(role: Role): boolean {
  return ROLE_META[role].surface === "mobile";
}

export function roleLabel(role: Role): string {
  return ROLE_META[role]?.label ?? role;
}

// ---------------------------------------------------------------------------
// The state machine.
//
// A vehicle only moves when a (fromStatus, role, action) triple matches a row
// here. This table is the single authority; every API route resolves against
// it rather than inferring intent from request keys. SUPER_ADMIN is allowed to
// invoke any action regardless of its role guard (see canRunAction).
// ---------------------------------------------------------------------------

export type Action =
  | "REQUEST_CN"
  | "RELEASE"
  | "APPROVE_CN"
  | "DECLINE_CN"
  | "SUBMIT_ASSESSMENT"
  | "APPROVE_REPAIR"
  | "SEND_BACK_TO_ENGINEER"
  | "COMPLETE_REGISTRATION"
  | "SET_SOP"
  | "APPROVE_PRICE"
  | "PUSH_LIVE"
  | "SEND_BACK_TO_AGM"
  | "AWARD_SALE";

export interface Transition {
  action: Action;
  from: VehicleStatus;
  to: VehicleStatus;
  role: Role; // the role that owns this action (besides SUPER_ADMIN)
  event: EventType;
  /** Reason is mandatory for this transition (declines / send-backs). */
  requiresNote?: boolean;
  /** True when the desk must submit extra data (costs, deadline, price) with the
   *  move — those desks use a custom panel, not the generic transition button. */
  carriesData?: boolean;
  /** Visual weight of the primary action button. */
  tone?: "primary" | "ok" | "danger";
  label: string;
}

export const TRANSITIONS: Transition[] = [
  // 1 — Recovery Team resolves a captured file.
  {
    action: "REQUEST_CN",
    from: "CAPTURED",
    to: "CN_REQUESTED",
    role: "RECOVERY_TEAM",
    event: "CN_REQUESTED",
    tone: "primary",
    label: "Request Credit Note",
  },
  {
    action: "RELEASE",
    from: "CAPTURED",
    to: "RELEASED",
    role: "RECOVERY_TEAM",
    event: "RELEASED",
    requiresNote: true,
    tone: "danger",
    label: "Release to customer",
  },

  // 2 — Recovery Manager rules on the Credit Note.
  {
    action: "APPROVE_CN",
    from: "CN_REQUESTED",
    to: "CN_APPROVED",
    role: "RECOVERY_MANAGER",
    event: "CN_APPROVED",
    tone: "ok",
    label: "Approve Credit Note",
  },
  {
    action: "DECLINE_CN",
    from: "CN_REQUESTED",
    to: "CAPTURED",
    role: "RECOVERY_MANAGER",
    event: "CN_DECLINED",
    requiresNote: true,
    tone: "danger",
    label: "Decline — return to Recovery",
  },

  // 3 — Service Engineer submits the assessment.
  {
    action: "SUBMIT_ASSESSMENT",
    from: "CN_APPROVED",
    to: "COST_SUBMITTED",
    role: "SERVICE_ENGINEER",
    event: "ASSESSMENT_SUBMITTED",
    carriesData: true,
    label: "Submit cost analysis",
  },

  // 4 — Service Head approves the repair (and sets the timeframe) or sends back.
  {
    action: "APPROVE_REPAIR",
    from: "COST_SUBMITTED",
    to: "REPAIR_APPROVED",
    role: "SERVICE_HEAD",
    event: "REPAIR_APPROVED",
    carriesData: true,
    label: "Approve repair & set deadline",
  },
  {
    action: "SEND_BACK_TO_ENGINEER",
    from: "COST_SUBMITTED",
    to: "CN_APPROVED",
    role: "SERVICE_HEAD",
    event: "REPAIR_SENT_BACK",
    requiresNote: true,
    tone: "danger",
    label: "Send back to engineer",
  },

  // 5 — Registration Team completes registration costing.
  {
    action: "COMPLETE_REGISTRATION",
    from: "REPAIR_APPROVED",
    to: "REGISTRATION_DONE",
    role: "REGISTRATION_TEAM",
    event: "REGISTRATION_COMPLETED",
    carriesData: true,
    label: "Complete registration costing",
  },

  // 6 — Sr. Executive sets the first SOP figure.
  {
    action: "SET_SOP",
    from: "REGISTRATION_DONE",
    to: "SOP_ADDED",
    role: "SR_EXECUTIVE",
    event: "SOP_SET",
    carriesData: true,
    label: "Set SOP cost",
  },

  // 7 — AGM / DGM approves the selling price.
  {
    action: "APPROVE_PRICE",
    from: "SOP_ADDED",
    to: "PRICE_APPROVED",
    role: "AGM_DGM",
    event: "PRICE_APPROVED",
    carriesData: true,
    label: "Approve selling price",
  },

  // 8 — GM signs off to Live, or returns to AGM.
  {
    action: "PUSH_LIVE",
    from: "PRICE_APPROVED",
    to: "LIVE_FOR_RESALE",
    role: "GM_SR_GM",
    event: "PUSHED_LIVE",
    tone: "ok",
    label: "Approve for resale",
  },
  {
    action: "SEND_BACK_TO_AGM",
    from: "PRICE_APPROVED",
    to: "SOP_ADDED",
    role: "GM_SR_GM",
    event: "SENT_BACK",
    requiresNote: true,
    tone: "danger",
    label: "Send back to AGM / DGM",
  },

  // 9 — GM awards the vehicle to the winning bid and closes the sale.
  {
    action: "AWARD_SALE",
    from: "LIVE_FOR_RESALE",
    to: "SOLD",
    role: "GM_SR_GM",
    event: "SALE_AWARDED",
    carriesData: true,
    tone: "ok",
    label: "Award to winning bid",
  },
];

export function findTransition(
  from: VehicleStatus,
  action: Action,
): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.action === action);
}

/** May this role run this action from this status? SUPER_ADMIN may run any. */
export function canRunAction(
  role: Role,
  from: VehicleStatus,
  action: Action,
): Transition | null {
  const t = findTransition(from, action);
  if (!t) return null;
  if (role === "SUPER_ADMIN") return t;
  return t.role === role ? t : null;
}

/** The actions this role can take on a vehicle in this status, in table order. */
export function availableActions(
  role: Role,
  from: VehicleStatus,
): Transition[] {
  return TRANSITIONS.filter(
    (t) => t.from === from && (role === "SUPER_ADMIN" || t.role === role),
  );
}

/** Actions runnable through the generic transition endpoint (no extra data). */
export function simpleActions(role: Role, from: VehicleStatus): Transition[] {
  return availableActions(role, from).filter((t) => !t.carriesData);
}

export const TERMINAL_STATUSES: VehicleStatus[] = ["RELEASED"];

/** The statuses a role is responsible for acting on — i.e. its inbox. */
export function inboxStatusesForRole(role: Role): VehicleStatus[] {
  const set = new Set<VehicleStatus>();
  for (const t of TRANSITIONS) {
    if (t.role === role) set.add(t.from);
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Non-status permissions — edits that don't move the file.
// ---------------------------------------------------------------------------

export const LETTER_ORDER: LetterStage[] = [
  "NONE",
  "LETTER_1",
  "LETTER_2",
  "LETTER_3",
  "WRITTEN",
];

/** Issuing Letter 3 or the final Written notice locks the capture record. */
export function letterLocksRecord(stage: LetterStage): boolean {
  return stage === "LETTER_3" || stage === "WRITTEN";
}

/**
 * Can this actor edit the core capture fields of this vehicle right now?
 * Recovery Team owns the record while unlocked and still in their hands;
 * Super Admin always can (and can unlock).
 */
export function canEditCapture(
  role: Role,
  vehicle: { status: VehicleStatus; isLocked: boolean; capturedById: string | null },
  userId: string,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role !== "RECOVERY_TEAM") return false;
  if (vehicle.capturedById !== userId) return false;
  if (vehicle.isLocked) return false;
  return vehicle.status === "CAPTURED";
}

/** Sr. Executive keeps SOP write access for the life of the file, incl. Live. */
export function canEditSop(role: Role, status: VehicleStatus): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role !== "SR_EXECUTIVE") return false;
  // From the moment registration is done through Live, SOP stays editable.
  return (
    status === "REGISTRATION_DONE" ||
    status === "SOP_ADDED" ||
    status === "PRICE_APPROVED" ||
    status === "LIVE_FOR_RESALE"
  );
}

/** Sr. Executive grades vehicle condition, in the same window as SOP. */
export function canSetGrade(role: Role, status: VehicleStatus): boolean {
  return canEditSop(role, status);
}

/**
 * Who may set/revise the approved price.
 *  - AGM / DGM: from SOP costing through Live (they approve it first, then revise).
 *  - GM / Sr. GM: at the final gate (PRICE_APPROVED) they can override before pushing live.
 */
export function canEditPrice(role: Role, status: VehicleStatus): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role === "AGM_DGM") {
    return status === "SOP_ADDED" || status === "PRICE_APPROVED" || status === "LIVE_FOR_RESALE";
  }
  if (role === "GM_SR_GM") return status === "PRICE_APPROVED";
  return false;
}

// ---------------------------------------------------------------------------
// Resale bidding
// ---------------------------------------------------------------------------

/** Sales officers bid on anything sitting on the marketplace. */
export function canPlaceBid(role: Role, status: VehicleStatus): boolean {
  if (status !== "LIVE_FOR_RESALE") return false;
  return role === "SALES_TEAM" || role === "SUPER_ADMIN";
}

/**
 * Bidding is sealed: an officer only ever sees their own offers. Management
 * reads the whole book so they can award the sale.
 */
export function canViewAllBids(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "GM_SR_GM" || role === "AGM_DGM";
}

/** Only the final-approval desk closes a sale. */
export function canAwardSale(role: Role, status: VehicleStatus): boolean {
  if (status !== "LIVE_FOR_RESALE") return false;
  return role === "GM_SR_GM" || role === "SUPER_ADMIN";
}

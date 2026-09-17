import type {
  CaseFlagKind,
  EventType,
  LetterStage,
  Role,
  VehicleStatus,
} from "@prisma/client";

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
    label: "Recovery Operations HQ",
    short: "Recovery HQ",
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
    label: "Service Operations HQ",
    short: "Service HQ",
    designations: "Service Manager",
    surface: "desktop",
    home: "/dashboard",
  },
  REGISTRATION_TEAM: {
    label: "Registration Operations HQ",
    short: "Registration HQ",
    designations: "LO / Sr. LO / AM",
    surface: "desktop",
    home: "/dashboard",
  },
  SR_EXECUTIVE: {
    label: "Resale Operations HQ",
    short: "Resale HQ",
    designations: "Sr. Ex",
    surface: "desktop",
    home: "/dashboard",
  },
  AGM_DGM: {
    label: "Operations Lead",
    short: "Ops Lead",
    designations: "AGM / DGM",
    surface: "desktop",
    home: "/dashboard",
  },
  GM_SR_GM: {
    label: "Business Head",
    short: "Business Head",
    designations: "BM",
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
  // Not a desk. Whatever this account can see is named by the Portal attached
  // to it, and `label` is overridden by the portal's own name wherever the
  // member can see it — "Board observer" is the thing they belong to; "Portal
  // viewer" is only what the system calls the shape of the account.
  PORTAL_VIEWER: {
    label: "Portal viewer",
    short: "Portal",
    designations: "—",
    surface: "desktop",
    home: "/portal",
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

  // 4 — Service Manager approves the repair (and sets the timeframe) or sends back.
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

  // 8 — BM signs off to Live, or returns to AGM.
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

  // 9 — The Sr. Executive awards the vehicle to the winning bid and closes
  //     the sale. They own the resale book: they price it, carry it month to
  //     month, and decide which offer takes it off their hands.
  {
    action: "AWARD_SALE",
    from: "LIVE_FOR_RESALE",
    to: "SOLD",
    role: "SR_EXECUTIVE",
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

/**
 * When the Sr. Executive may write SOP.
 *
 * Two windows, and the gap between them is deliberate:
 *
 *  - REGISTRATION_DONE — their turn. Set SOP, grade, propose a price.
 *  - LIVE_FOR_RESALE  — the vehicle is theirs again, and the monthly cycle
 *                       requires re-pricing a carried-forward vehicle.
 *
 * Between those, at SOP_ADDED and PRICE_APPROVED, the file is out for approval
 * and their inputs are LOCKED. Moving the cost basis under a desk that is
 * currently approving a margin calculated from it is exactly the race the
 * hand-off rule exists to prevent. If the BM sends it back the status returns
 * to SOP_ADDED — the AGM's desk — and the AGM re-prices from there.
 */
export function canEditSop(role: Role, status: VehicleStatus): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role !== "SR_EXECUTIVE") return false;
  return status === "REGISTRATION_DONE" || status === "LIVE_FOR_RESALE";
}

/** Sr. Executive grades vehicle condition, in the same window as SOP. */
export function canSetGrade(role: Role, status: VehicleStatus): boolean {
  return canEditSop(role, status);
}

/**
 * Who may revise the registration-related cost estimate and its validity
 * window — the same standing watch as lib/registrationValidity.ts.
 *
 * Not gated by status at all, unlike every other cost editor in this file.
 * Registration’s figure is a running estimate of what it would cost to renew
 * the vehicle’s papers TODAY, and that number keeps moving for as long as the
 * vehicle sits unsold — long after the file itself has left Registration’s
 * queue for Sr. Executive, AGM/DGM, the marketplace, even a sale. The only
 * real gate is whether there is anything to revise: a vehicle Registration
 * has never touched has no estimate to update.
 */
export function canEditRegistrationCost(role: Role, everRegistered: boolean): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (role !== "REGISTRATION_TEAM") return false;
  return everRegistered;
}

/**
 * Who may set/revise the approved price.
 *  - AGM / DGM: from SOP costing through Live (they approve it first, then revise).
 *  - BM: at the final gate (PRICE_APPROVED) they can override before pushing live.
 */
export function canEditPrice(role: Role, status: VehicleStatus): boolean {
  if (role === "SUPER_ADMIN") return true;
  // AGM/DGM price at their own desk only. Once approved the file is with the
  // BM, and it comes back to SOP_ADDED — this same window — if the BM returns
  // it, so nothing is lost by closing the later stages.
  if (role === "AGM_DGM") return status === "SOP_ADDED";
  // The BM overrides at their own gate, which is their turn, not a reach back.
  if (role === "GM_SR_GM") return status === "PRICE_APPROVED";
  return false;
}

/**
 * Who may read the cost of a vehicle.
 *
 * The field roles may not. An ARO records a seizure, an engineer prices a
 * repair, a sales officer bids — none of them needs the assembled cost basis,
 * and one of them actively must not have it: a sales officer who can see total
 * cost and margin is bidding against a number the company would rather they
 * did not know.
 *
 * The desk surface is the line. Every role that approves, prices or oversees
 * reads the money; every role that works in the field does not. That is the
 * same split ROLE_META already draws for mobile vs desktop, so it is stated
 * once here rather than listed twice and allowed to drift.
 *
 * An engineer still sees the estimate THEY entered, on their own panel. That
 * is their input, not the roll-up.
 */
export function canViewCosts(role: Role): boolean {
  // A portal viewer is on the desk surface and is still not a desk. Their cost
  // visibility is a property of the Portal attached to their account, not of
  // the screen they happen to be holding, so it is answered by the grant (see
  // lib/portals.ts) and never here. Returning false is the safe reading for
  // any code path that asks the question the old way.
  if (role === "PORTAL_VIEWER") return false;
  return !isMobileRole(role);
}

// ---------------------------------------------------------------------------
// Customer offers
// ---------------------------------------------------------------------------

/**
 * Who may put a customer's price on a live vehicle.
 *
 * Three field roles, and the reason is the same for all three: they are the
 * people who stand next to the vehicle in front of a buyer. A sales officer
 * works a customer list; an ARO knows every operator in their territory
 * because they took a truck off one of them last month; an engineer has the
 * workshop conversations nobody else hears. Restricting the offer form to
 * sales alone threw away two thirds of the company's reach into the market.
 *
 * They submit on a CUSTOMER's behalf, not their own, which is why several
 * offers from one officer on one vehicle is normal rather than suspicious.
 *
 * The approving desks are deliberately absent. A desk that sets the asking
 * price and then introduces a buyer at it is on both sides of the same trade.
 */
export const OFFER_ROLES: Role[] = ["SALES_TEAM", "RECOVERY_TEAM", "SERVICE_ENGINEER"];

/**
 * The label the offer book shows for the officer who brought an offer in.
 *
 * Management asked for this by name: an offer from an engineer and an offer
 * from a territory sales officer are not the same signal, and the book has to
 * say which is which without the reader having to know every staff ID.
 */
export function offerLevel(role: Role): string {
  switch (role) {
    case "SALES_TEAM":
      return "Sales Officer";
    case "RECOVERY_TEAM":
      return "ARO";
    case "SERVICE_ENGINEER":
      return "Engineer";
    case "SUPER_ADMIN":
      return "Admin";
    default:
      return ROLE_META[role]?.label ?? role;
  }
}

/**
 * Does this role see the marketplace as a STOREFRONT?
 *
 * The three offer-taking roles do. They get a product listing — photographs,
 * specification, one price — and nothing else: no desk chain, no status, no
 * cost basis. That is not decoration, it is the same rule canViewCosts draws,
 * carried through to the surface. An officer who can see that a vehicle is
 * "awaiting BM sign-off" or what it cost to refurbish is negotiating with
 * information the company did not intend to hand across the table.
 *
 * Everyone else keeps the operational register: offer counts, cycle state and
 * a route into the file itself.
 */
export function isStorefrontRole(role: Role): boolean {
  return OFFER_ROLES.includes(role);
}

/**
 * Offers are taken on anything sitting on the marketplace.
 *
 * `onHold` is passed in rather than derived here so this file stays free of
 * clock reads: a vehicle whose pricing month has run out is still
 * LIVE_FOR_RESALE but is closed to new offers until it is re-priced. Callers
 * that genuinely have no cycle information pass false.
 */
export function canPlaceBid(role: Role, status: VehicleStatus, onHold = false): boolean {
  if (status !== "LIVE_FOR_RESALE") return false;
  if (onHold) return false;
  return OFFER_ROLES.includes(role) || role === "SUPER_ADMIN";
}

/**
 * The book is sealed sideways and open upward: an officer reads only the
 * offers they submitted, management reads every offer with the customer, the
 * officer, their territory and their level attached — that is the whole point
 * of collecting it, since who an offer comes from is half of what makes it
 * worth taking.
 */
export function canViewAllBids(role: Role): boolean {
  return (
    role === "SUPER_ADMIN" ||
    role === "GM_SR_GM" ||
    role === "AGM_DGM" ||
    // The Sr. Executive closes the sale, so they read the book they are
    // choosing a winner from.
    role === "SR_EXECUTIVE"
  );
}

/**
 * Who closes a sale.
 *
 * The Sr. Executive, and only them. They own the resale book — they price it,
 * carry it month to month, and decide which offer takes it. The BM's authority
 * ends at pushing a vehicle live; the sale itself is not theirs to close.
 *
 * A held vehicle can still be awarded: the hold stops NEW offers against a
 * stale price, it does not invalidate offers already made.
 */
export function canAwardSale(role: Role, status: VehicleStatus): boolean {
  if (status !== "LIVE_FOR_RESALE") return false;
  return role === "SR_EXECUTIVE" || role === "SUPER_ADMIN";
}

/** Who may re-price a held vehicle and put it back on the market. */
export function canManageResaleCycle(role: Role, status: VehicleStatus): boolean {
  if (status !== "LIVE_FOR_RESALE") return false;
  return role === "SR_EXECUTIVE" || role === "SUPER_ADMIN";
}

// ---------------------------------------------------------------------------
// Off-road intake — capture requests, accident and police-custody cases
//
// A deliberately narrow set of roles. The whole point of putting accident and
// Thana tracking in this app was to give the recovery organisation one place
// to see every off-road vehicle; it was NOT to hand seven approving desks a
// second pipeline to review. So the field opens cases, the manager rules on
// them, and Super Admin reads everything.
//
// Every other desk is absent by design. A Service Engineer has no use for a
// truck sitting in a police compound — there is nothing to assess and no
// budget to price — and a vehicle that never converts to a capture never
// reaches them. The moment one DOES convert it becomes an ordinary Vehicle at
// CAPTURED and every existing desk rule applies to it unchanged.
// ---------------------------------------------------------------------------

/** Who may open an accident or police-custody case: the officers in the field. */
export function canOpenOffroadCase(role: Role): boolean {
  return role === "RECOVERY_TEAM" || role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN";
}

/**
 * Who may read the off-road book.
 *
 * Wider than who may write it, and only by one role: the admin roll-up is the
 * reason this moved into Resale Intel at all — one screen showing every
 * off-road vehicle whatever put it there.
 */
export function canViewOffroad(role: Role): boolean {
  return role === "RECOVERY_TEAM" || role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN";
}

/**
 * Who sees the WHOLE book rather than their own cases.
 *
 * An ARO reads the cases they opened, the same way they read the captures they
 * made. The manager reads their organisation's, because a case they cannot see
 * is a case they cannot revise.
 */
export function canViewAllOffroad(role: Role): boolean {
  return role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN";
}

/**
 * Who may read the off-road book as a REPORT rather than as a queue.
 *
 * Business management asks a different question of this data than the recovery
 * desk does. The desk asks "what do I action next"; the BM asks "how much of
 * the fleet is not earning, and where". Same records, no overlap in what you
 * do with them — so this is its own permission rather than a widening of
 * `canViewOffroad`, which also gates the case APIs and the intake queue.
 * Nothing behind this predicate can write, flag or revise anything.
 */
export function canViewOffroadSummary(role: Role): boolean {
  return role === "GM_SR_GM" || role === "SUPER_ADMIN";
}

/**
 * Who may read the realised resale book.
 *
 * The three desks that own a number the sale is measured against: the Business
 * Head signs off the final price, the Operations Lead sets it, and Resale
 * Operations HQ sets the SOP that is the largest controllable line in the cost
 * basis. Each of them is judged by what this page reports, so each of them can
 * read it.
 *
 * Deliberately NOT the sales team, whose own offers make up these figures, and
 * not the recovery or service desks — cost and realised price are commercial
 * facts that already stop at the marketplace boundary elsewhere in the app,
 * and this page would be the one hole in that.
 */
export function canViewSalesMargin(role: Role): boolean {
  return (
    role === "GM_SR_GM" ||
    role === "AGM_DGM" ||
    role === "SR_EXECUTIVE" ||
    role === "SUPER_ADMIN"
  );
}

/**
 * Who may move the goalposts on a case.
 *
 * The manager, not the officer. The field estimate is evidence — what the ARO
 * believed at the roadside — and letting the same person quietly restate it
 * every time it slips would erase the one signal the pair of columns exists to
 * preserve. The officer who thinks the estimate is wrong says so in a remark;
 * the desk decides whether the clock moves.
 */
export function canReviseCaseTimeline(role: Role): boolean {
  return role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN";
}

/**
 * Who may close a case — back on-road, released, or converted to a capture.
 *
 * The officer who opened it, and nobody else at the desk.
 *
 * The Recovery Manager sits at HQ. They can see that a vehicle's window has
 * run out; they cannot see whether it is actually back on the road, whether
 * the thana really released it, or whether an NOC has been signed. Every one of
 * these three outcomes is an assertion about a physical vehicle, and letting a
 * desk assert it from a hundred miles away is how a case gets closed on an
 * assumption.
 *
 * So the desk supervises instead: it revises the clock, raises attention flags
 * and answers support requests. It does not declare outcomes. If an officer has
 * left, the case is reassigned — not closed on their behalf.
 */
export function canResolveOffroadCase(
  role: Role,
  openedById: string,
  userId: string,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  return role === "RECOVERY_TEAM" && openedById === userId;
}

// ---------------------------------------------------------------------------
// Case flags — the two-way channel between the field and the desk
// ---------------------------------------------------------------------------

/**
 * Which side of the flag channel this role sits on.
 *
 * One function, because every flag permission below is really this question
 * asked again. Returns null for roles that have no business in the channel at
 * all — which is every desk outside recovery.
 */
export function caseViewerFor(role: Role): "field" | "desk" | null {
  if (role === "RECOVERY_TEAM") return "field";
  if (role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN") return "desk";
  return null;
}

/** May this role raise this kind of flag? Each side raises exactly one. */
export function canRaiseFlag(role: Role, kind: CaseFlagKind): boolean {
  const side = caseViewerFor(role);
  if (!side) return false;
  return kind === "SUPPORT_REQUEST" ? side === "field" : side === "desk";
}

/**
 * May this actor close this flag?
 *
 * Two ways in, and they mean different things. The side the flag is ADDRESSED
 * to resolves it — that is the ask being answered. The person who RAISED it may
 * also close it, which is a withdrawal: the workshop rang back, the case moved
 * on, the flag is moot. Both land in RESOLVED because the question either way
 * is only ever "is anyone still waiting on this".
 */
export function canClearFlag(
  role: Role,
  flag: { kind: CaseFlagKind; raisedById: string },
  userId: string,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  if (flag.raisedById === userId) return true;
  const side = caseViewerFor(role);
  if (!side) return false;
  // The recipient is whichever side did not raise it.
  return kind_recipient(flag.kind) === side;
}

function kind_recipient(kind: CaseFlagKind): "field" | "desk" {
  return kind === "SUPPORT_REQUEST" ? "desk" : "field";
}

/** Who may ask for pre-approval to capture a vehicle. */
export function canRequestCapture(role: Role): boolean {
  return role === "RECOVERY_TEAM" || role === "SUPER_ADMIN";
}

/**
 * Who may work the capture form itself.
 *
 * The same set that raises the request, and deliberately a separate predicate:
 * these are two different acts — asking to take a vehicle, and recording the
 * one you are standing next to — and if the product ever separates them, this
 * is where that happens. It mirrors `POST /api/vehicles`, which is the actual
 * authority; this only decides whether the page is worth rendering.
 *
 * The form is still reachable only from an approved request or a converted
 * case. This is the role gate, not the origin gate.
 */
export function canCaptureVehicle(role: Role): boolean {
  return role === "RECOVERY_TEAM" || role === "SUPER_ADMIN";
}

/**
 * Who rules on a capture request.
 *
 * The Recovery Manager, and nobody else — the same desk that already rules on
 * the Credit Note at the far end of the file. Putting both gates on one desk
 * is deliberate: the person who authorises taking a vehicle should be the
 * person who later has to justify writing it off.
 */
export function canDecideCaptureRequest(role: Role): boolean {
  return role === "RECOVERY_MANAGER" || role === "SUPER_ADMIN";
}

/** Whether this actor may withdraw a pending request — its author, or admin. */
export function canWithdrawCaptureRequest(
  role: Role,
  requestedById: string,
  userId: string,
): boolean {
  if (role === "SUPER_ADMIN") return true;
  return role === "RECOVERY_TEAM" && requestedById === userId;
}

import { z } from "zod";

/**
 * Every money field on this system is whole taka, and this is where that is
 * enforced.
 *
 * The columns behind them are `Float` — MySQL DOUBLE — which represents whole
 * numbers exactly up to 2^53, far above the 1e12 ceiling each of these fields
 * carries. So sums like `repair + transport + other + registration + sop` are
 * exact arithmetic *as long as every term is an integer*, and quietly stop
 * being exact the moment one is not. Nothing previously required that: the
 * schemas took any number, so a client could post `45000.005` and the margin
 * computed from it would carry a rounding error no one could see.
 *
 * The alternative was migrating every money column to `Decimal`, which is the
 * textbook answer and the wrong trade here: it would convert 337 call sites
 * across 42 files, break arithmetic that currently reads as arithmetic, and
 * put a non-serialisable type on the server/client boundary this app crosses
 * constantly — all to represent a precision the product does not use. `taka()`
 * already renders every figure with `Math.round`, so a fractional amount could
 * never be displayed, only silently accumulated.
 *
 * Enforcing the invariant is what makes the existing storage correct. Should
 * the business ever price in poisha, this constant is the single place that
 * assumption is written down, and the migration starts by deleting it.
 */
const WHOLE_TAKA = "Enter a whole taka amount";

/**
 * A figure that must actually be given.
 *
 * `z.coerce.number()` turns `null`, `undefined` and `""` into **0**, so a field
 * left blank arrives as a legitimate zero rather than as an error — and on
 * these three fields in particular that reads as "this customer owes nothing",
 * which is the opposite of "the officer did not have the statement".
 *
 * Mapping empty to `undefined` before coercion is what lets `required_error`
 * fire. Every required amount on the intake forms goes through this.
 */
function requiredAmount(message: string, max: number, whole = false) {
  const base = z.coerce.number({ required_error: message, invalid_type_error: message });
  return z.preprocess(
    (v) => (v === null || v === undefined || v === "" ? undefined : v),
    whole ? base.int(WHOLE_TAKA).min(0).max(max) : base.min(0).max(max),
  );
}

/**
 * Date bounds for backdated entry.
 *
 * `endOfToday` rather than `new Date()`: a date-only input arrives as UTC
 * midnight for the day chosen, and comparing that against the current instant
 * rejects today itself for anyone east of Greenwich — which is everyone using
 * this product. Dhaka is UTC+6, so a capture entered at 9am local is 03:00 UTC
 * on a value stamped 00:00 UTC, and the naive comparison passes by luck; the
 * same entry at 3am local does not. Comparing against the end of the day
 * removes the coin flip.
 */
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function yearsAgo(n: number): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Slots the capture form may upload into. CAPTURE_FORM is the photographed
// paper form and is optional; the five vehicle angles are not.
const PHOTO_SLOTS = [
  "LEFT",
  "RIGHT",
  "FRONT",
  "BACK",
  "CABIN",
  "SLEEP",
  "CAPTURE_FORM",
  "REMARKS",
] as const;

/**
 * The capture form is now all-or-nothing.
 *
 * Every field an ARO is shown must be filled before a vehicle can be captured.
 * The record is the evidential basis for a Credit Note, a repair budget and
 * eventually a sale price, and a half-filled one costs more to chase later
 * than it costs to complete at the roadside.
 *
 * The one operational dependency this creates is on master data: brand and
 * model are picked from the admin-managed list, so a vehicle whose make is not
 * on that list can no longer be captured at all. Keeping Admin > Master data
 * current is now on the critical path for field work.
 */
export const captureSchema = z
  .object({
    // Identity
    registrationNo: z.string().trim().min(1, "Registration number is required").max(60),
    customerName: z.string().trim().min(1, "Customer name is required").max(120),
    customerCode: z.string().trim().min(1, "Customer code is required").max(60),
    // Brand and model come from the admin-managed pick list, so the form sends
    // ids. The server resolves them to the names it stores, which is what stops
    // a hand-rolled request putting an arbitrary brand on a vehicle.
    brandId: z.string().trim().min(1, "Brand is required"),
    modelId: z.string().trim().min(1, "Model is required"),
    // Mileage is required, but "N/A" is a legitimate answer: an odometer can be
    // broken, disconnected or unreadable, and a blank field cannot tell that
    // apart from an ARO who did not look.
    mileage: z.string().trim().min(1, "Mileage is required").max(30),
    condition: z.enum(["ON_ROAD", "OFF_ROAD", "ACCIDENT"], {
      required_error: "Vehicle condition is required",
      invalid_type_error: "Vehicle condition is required",
    }),

    // Placement. Either a location from the master list OR a typed one; the
    // refinement below enforces exactly one.
    territoryId: z.string().trim().min(1, "Territory is required"),
    currentLocationId: z.string().trim().optional().or(z.literal("")),
    currentLocationOther: z.string().trim().max(120).optional().or(z.literal("")),
    // When the seizure actually happened.
    //
    // Optional — the API defaults it to now, which is right for a capture being
    // recorded as it happens. It is sent when the officer is entering a vehicle
    // that has been in hand for a while, which is the ordinary case during a
    // backfill window and an occasional one otherwise (a seizure on Friday
    // evening, typed up on Monday).
    //
    // Bounded at both ends. A future capture date is not a late entry, it is a
    // typo or a claim about a seizure that has not happened; and three years is
    // well past any backlog anyone is reconciling, so a date older than that is
    // a mistyped year rather than a very old vehicle. Both are checked here
    // rather than only in the browser, because the browser's `max` attribute is
    // a courtesy and not a control.
    captureDate: z.coerce
      .date()
      .max(endOfToday(), { message: "A capture cannot be dated in the future" })
      .min(yearsAgo(3), { message: "That date is more than three years back — check the year" })
      .optional(),

    // Condition
    remarks: z.string().trim().min(1, "Remarks are required").max(2000),
    // No longer asked at capture. Kept on the schema because the marketplace
    // still reads it on older records, and defaulted rather than removed so a
    // client that stops sending it does not fail validation.
    hasSleeperCabin: z.boolean().default(false),

    // Case slip and its fine. No default: "not answered" and "no case slip"
    // are different facts, and defaulting the first to the second is how a
    // fine goes unrecorded.
    hasCaseSlip: z.boolean({ required_error: "Answer whether there is a case slip" }),
    caseSlipFine: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).optional().nullable(),

    // What the seizure cost on the day. Record-only — see the note on
    // Vehicle.captureCost; it never reaches a price or a margin. Required
    // like every other field the officer is shown: it is money that left the
    // business, and the officer who spent it is the only person who knows the
    // figure. Zero is a legitimate answer and is not the same as leaving it
    // blank, which is why `requiredAmount` does not treat empty as zero.
    captureCost: requiredAmount("What the seizure cost is required", 1e9, true),

    // Assignment. No letter stage: every capture starts with none served, and
    // the ladder is stepped through afterwards on its own schedule.
    assignedEngineerId: z.string().trim().min(1, "Assign a service engineer"),

    // Provenance. Optional, and at most one of them: a capture either came
    // through an approved request, or out of an off-road case that stopped
    // being returnable, or straight from the field. The route validates that
    // the referenced record exists, belongs to this officer and is in a state
    // that can still be consumed — this only says the shape is legal.
    captureRequestId: z.string().trim().optional().or(z.literal("")),
    offroadCaseId: z.string().trim().optional().or(z.literal("")),

    // Checklist answers. Every question shown must carry an explicit yes or no
    // — the route cross-checks the set against the active question list, so a
    // short payload cannot skip one.
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1),
          answer: z.boolean(),
          note: z.string().trim().max(500).optional().or(z.literal("")),
        }),
      )
      .min(1, "Answer every document question"),

    // Photos — { slot, name } where name is a stored upload name.
    photos: z.array(
      z.object({
        slot: z.enum(PHOTO_SLOTS),
        name: z.string().min(1),
      }),
    ),
  })
  .superRefine((data, ctx) => {
    // Exactly one location. Neither is an unplaced vehicle; both is ambiguous
    // about which one is true.
    const hasPicked = !!data.currentLocationId;
    const hasTyped = !!data.currentLocationOther;
    if (!hasPicked && !hasTyped) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Current location is required",
        path: ["currentLocationId"],
      });
    }
    if (hasPicked && hasTyped) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Give either a listed location or a typed one, not both",
        path: ["currentLocationOther"],
      });
    }

    // A model without its brand cannot be resolved, and would otherwise be
    // silently dropped.
    if (data.modelId && !data.brandId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose a brand before a model",
        path: ["brandId"],
      });
    }

    // A declared case slip without an amount is an unfinished record.
    if (data.hasCaseSlip && (data.caseSlipFine === undefined || data.caseSlipFine === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the fine amount for the case slip",
        path: ["caseSlipFine"],
      });
    }

    // A capture has one origin. Both set would make the audit trail claim the
    // vehicle entered the pipeline twice.
    if (data.captureRequestId && data.offroadCaseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A capture comes from either a request or an off-road case, not both",
        path: ["captureRequestId"],
      });
    }

    const slots = new Set(data.photos.map((p) => p.slot));
    // The signed paper form is now part of the record rather than an extra.
    if (!slots.has("CAPTURE_FORM")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A photo of the signed capture form is required",
        path: ["photos"],
      });
    }
    for (const required of ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN"] as const) {
      if (!slots.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing the ${required} photo`,
          path: ["photos"],
        });
      }
    }
    // Counted rather than length-checked: the capture form and the remarks
    // shot are documents, not vehicle angles, so neither may satisfy the
    // minimum of five.
    const angles = data.photos.filter(
      (p) => p.slot !== "CAPTURE_FORM" && p.slot !== "REMARKS",
    ).length;
    if (angles < 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least five vehicle photos are required",
        path: ["photos"],
      });
    }
    if (data.hasSleeperCabin && !slots.has("SLEEP")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A sleeper-cabin photo is required for this vehicle",
        path: ["photos"],
      });
    }
  });

export type CaptureInput = z.infer<typeof captureSchema>;

export const transitionSchema = z.object({
  action: z.enum([
    "REQUEST_CN",
    "RELEASE",
    "APPROVE_CN",
    "DECLINE_CN",
    "SUBMIT_ASSESSMENT",
    "APPROVE_REPAIR",
    "SEND_BACK_TO_ENGINEER",
    "COMPLETE_REGISTRATION",
    "SET_SOP",
    "APPROVE_PRICE",
    "PUSH_LIVE",
    "SEND_BACK_TO_AGM",
  ]),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const letterUpdateSchema = z.object({
  letterStage: z.enum(["NONE", "LETTER_1", "LETTER_2", "LETTER_3", "WRITTEN"]).optional(),
  assignedEngineerId: z.string().trim().min(1).optional(),
});

export const costLineSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200),
  amount: z.coerce.number().int(WHOLE_TAKA).min(0, "Amount cannot be negative").max(1e12),
  // Optional photo of the part or fault. A stored upload name; the route
  // checks it against isSafeStoredName before it reaches the database.
  photoName: z.string().trim().max(64).optional().nullable(),
});

/**
 * Service Engineer: the cost analysis.
 *
 * One figure and one document, not a list of lines. The engineer is standing
 * next to a vehicle with a written estimate in their hand; asking them to
 * re-key it into a phone produced a worse copy of a better record. So the
 * record itself is uploaded, and the only thing typed is the number the
 * Service Manager is being asked to authorise.
 *
 * `repairNote` is one line of what the work is. Optional, because the sheet is
 * the detail — but it is what the approval screen and an as-is listing show,
 * so it is worth having.
 */
export const assessmentSchema = z
  .object({
    repairCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).default(0),
    repairNote: z.string().trim().max(500).optional().or(z.literal("")),
    transportCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).default(0),
    otherCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).default(0),
    /** Estimate sheets added this save — stored names from /api/upload. */
    newSheetNames: z.array(z.string().trim().min(1)).max(10).default([]),
    removeSheetIds: z.array(z.string().trim().min(1)).max(20).default([]),
    submit: z.boolean().default(false),
  })
  .superRefine((d, ctx) => {
    // Draft saves stay permissive: half-finished work must survive a phone
    // going flat. Only submission has to be complete.
    if (!d.submit) return;
    if (d.repairCost <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter the repair cost before submitting",
        path: ["repairCost"],
      });
    }
  });

export const repairApprovalSchema = z
  .object({
    approve: z.boolean().default(true),
    repairDays: z.coerce.number().int().min(1, "At least one day").max(365, "At most a year").optional(),
    /**
     * Sell in the condition it arrived in — the other way out of this desk.
     * Mutually exclusive with a repair: authorising a timeframe and declaring
     * that no work is needed are contradictory instructions to the workshop.
     */
    asIs: z.boolean().default(false),
    /** Why no work is needed. Required — an as-is decision removes the whole
     *  repair budget from the cost basis, so it has to carry its reasoning. */
    asIsReason: z.string().trim().max(280).optional(),
    editCosts: z.boolean().default(false),
    repairCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).optional(),
    transportCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).optional(),
    otherCost: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).optional(),
    /**
     * The approval sheet backing a repair authorisation — stored names from
     * /api/upload. Required on the repair route: an approval with no signed
     * sheet behind it is an assertion, and the engineer picking the job back
     * up needs the document, not just a status change.
     */
    sheetNames: z.array(z.string().trim().min(1)).max(5).default([]),
  })
  .superRefine((d, ctx) => {
    if (d.approve && d.asIs) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Approve a repair or sell as is — not both", path: ["asIs"] });
    }
    if (d.approve && !d.asIs && d.repairDays === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Repair timeframe is required to approve", path: ["repairDays"] });
    }
    if (d.approve && !d.asIs && d.sheetNames.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Attach the approval sheet before approving", path: ["sheetNames"] });
    }
    if (d.asIs && !d.asIsReason) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Say why no work is needed", path: ["asIsReason"] });
    }
    if (!d.approve && !d.asIs && !d.editCosts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nothing to save", path: ["editCosts"] });
    }
  });

// Registration Team: itemised registration costs. `validDays` only matters on
// submit — it opens the paperwork validity window (lib/registrationValidity.ts)
// the moment the file moves on, so Registration is never left with a vehicle
// that has no window at all.
export const registrationSchema = z.object({
  lines: z.array(costLineSchema).default([]),
  submit: z.boolean().default(false),
  validDays: z.coerce.number().int().min(1).max(730).optional(),
});

// Registration Team: revise the registration-related cost estimate and/or
// renew the validity window on a vehicle they have already registered,
// whenever either needs it — not gated by where the file currently sits.
// `lines` is optional: a quick date-only renewal (nothing about the cost has
// changed) should not have to resend the whole cost breakdown to keep it.
export const registrationValiditySchema = z.object({
  days: z.coerce.number().int().min(1, "Enter at least one day").max(730, "At most two years"),
  lines: z.array(costLineSchema).optional(),
});

// Sr. Executive: the SOP figure (revised monthly), the dealer commission, and
// the proposed selling price when first submitting the file for approval.
export const sopSchema = z.object({
  sopCost: z.coerce.number().int(WHOLE_TAKA).min(0, "Cannot be negative").max(1e12),
  // Optional so an existing client that does not send it leaves the stored
  // figure alone rather than silently zeroing it.
  dealerCommission: z.coerce.number().int(WHOLE_TAKA).min(0, "Cannot be negative").max(1e12).optional(),
  price: z.coerce.number().int(WHOLE_TAKA).min(0, "Cannot be negative").max(1e12).optional(),
  /** Re-price a held vehicle and put it back on the market for a new month. */
  relist: z.boolean().optional(),
});

/**
 * Sr. Executive: move the end of a vehicle's pricing month.
 *
 * Only ever forward. "Extend" is for buying a few days at the end of a month,
 * so pulling the date backwards — which would hold a vehicle early, mid-cycle,
 * with no re-pricing — is rejected by the route rather than allowed here.
 */
export const resaleCycleSchema = z.object({
  endsAt: z.coerce.date(),
});

// Sr. Executive: condition grade.
export const gradeSchema = z.object({
  grade: z.enum(["A", "B", "C", "D"]),
});

// AGM / DGM: the approved selling price.
export const priceSchema = z.object({
  approvedPrice: z.coerce.number().int(WHOLE_TAKA).min(0, "Cannot be negative").max(1e12),
});

// Sales officer: a sealed bid on a live vehicle. The approved price is a guide,
// not a floor — a low offer is accepted and flagged for management to weigh.
// A customer's offer, submitted by a field officer on that customer's behalf.
// The customer name is required — an offer with no buyer behind it is not an
// offer, and the desk choosing between them has to know who each one is for.
export const bidSchema = z.object({
  // Which sales officer this offer belongs to. Optional: an ARO or an
  // engineer brings their own customer and is credited themselves, so only
  // the shared sales desk ever sends it.
  salesOfficerId: z.string().trim().optional().or(z.literal("")),
  customerName: z
    .string()
    .trim()
    .min(2, "Enter the customer's name")
    .max(160, "That name is too long"),
  amount: z.coerce
    .number()
    .int(WHOLE_TAKA)
    .positive("Enter an amount above zero")
    .max(1e12, "That amount is too large"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// Correcting an offer already on the table. Every field is optional so the
// officer can fix the price without retyping the customer, but an empty body
// is rejected rather than silently written as a no-op revision.
export const bidEditSchema = z
  .object({
    salesOfficerId: z.string().trim().optional().or(z.literal("")),
    customerName: z.string().trim().min(2).max(160).optional(),
    amount: z.coerce.number().int(WHOLE_TAKA).positive("Enter an amount above zero").max(1e12).optional(),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine(
    (d) =>
      d.customerName !== undefined ||
      d.amount !== undefined ||
      d.note !== undefined ||
      d.salesOfficerId !== undefined,
    { message: "Nothing to change" },
  );

// BM: close the sale by awarding one of the standing offers.
export const awardSchema = z.object({
  bidId: z.string().trim().min(1, "Choose the winning bid"),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
  /**
   * The commission as finally agreed, if it moved.
   *
   * It is set months earlier when the vehicle is first priced, off an expected
   * sale. What the dealer is actually paid is settled with the buyer at the
   * close, so this is the last moment the figure can be made true — and the
   * only moment anyone knows it. Optional: omitted means it did not change,
   * which is different from zero (a sale with no commission at all).
   */
  dealerCommission: z.coerce.number().int(WHOLE_TAKA).min(0).max(1e12).optional(),
});

// --- Admin: users & master data ---

const ROLE_VALUES = [
  "SUPER_ADMIN",
  "RECOVERY_TEAM",
  "RECOVERY_MANAGER",
  "SERVICE_ENGINEER",
  "SERVICE_HEAD",
  "REGISTRATION_TEAM",
  "SR_EXECUTIVE",
  "AGM_DGM",
  "GM_SR_GM",
  "SALES_TEAM",
  "PORTAL_VIEWER",
] as const;

const nullableId = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v && v.length ? v : null));

export const userCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  staffId: z.string().trim().min(1, "Staff ID is required").max(40),
  designation: z.string().trim().max(60).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES),
  /**
   * Every territory this person works, and which one they are based in.
   *
   * A list, because a territory left unstaffed gets picked up by the officer
   * next door — see the TerritoryPosting model. `baseTerritoryId` says which of
   * them is theirs; the rest are recorded as cover. `postingError` enforces the
   * pairing, in one place, for both routes.
   */
  territoryIds: z.array(z.string().trim().min(1)).max(20).default([]),
  baseTerritoryId: nullableId,
  /**
   * The same postings, named rather than picked.
   *
   * The territory list is not a thing anybody maintains separately — it is
   * whatever the field force is posted to. An administrator adding an ARO
   * types the patch that officer works, and if it is the first officer there,
   * the patch comes into existence at that moment. When these are present
   * they REPLACE the id fields above, which remain for the bulk import and for
   * any caller that already holds ids.
   */
  territoryNames: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  baseTerritoryName: z.string().trim().max(80).optional().or(z.literal("")),
  // The sales patch. Free text, and only meaningful on a sales officer — the
  // form hides it for every other role rather than storing a value nobody
  // will ever read.
  salesTerritory: z.string().trim().max(80).optional().or(z.literal("")),
  // Only meaningful on a PORTAL_VIEWER, and required on one — see the refine
  // below.
  portalId: nullableId,
  // No password field, here or on the edit schema below. The Staff ID is the
  // credential (see lib/credential.ts) and the route derives it from the
  // Staff ID it was given — so there is no request shape that can mint an
  // account whose sign-in differs from its Staff ID.
});

/**
 * Bulk user import.
 *
 * Restricted to the three field roles on purpose. The whole point of this
 * route is to onboard sales, recovery and service officers a hundred at a
 * time — and a spreadsheet is exactly the wrong instrument for minting a
 * Super Admin or a pricing approver. Those stay one-at-a-time decisions made
 * on a form where the person doing it has to look at what they are choosing.
 */
export const IMPORTABLE_ROLES = ["SALES_TEAM", "RECOVERY_TEAM", "SERVICE_ENGINEER"] as const;

export const userImportRowSchema = z.object({
  staffId: z.string().trim().min(1, "Staff ID is required").max(40),
  name: z.string().trim().min(1, "Name is required").max(120),
  role: z.enum(IMPORTABLE_ROLES, {
    errorMap: () => ({ message: "Role must be Sales Team, Recovery Team or Service Engineer" }),
  }),
  designation: z.string().trim().max(60).optional().or(z.literal("")),
  /** Recovery territory, by NAME — an admin has the map, not our ids. */
  territory: z.string().trim().max(80).optional().or(z.literal("")),
  /** The sales patch. Free text, and only meaningful on a sales officer. */
  salesTerritory: z.string().trim().max(80).optional().or(z.literal("")),
});

export const userImportSchema = z
  .object({
    // No starting password either: an imported officer signs in with the Staff
    // ID the spreadsheet gave them, which is the one column the file was
    // always guaranteed to carry.
    rows: z.array(userImportRowSchema).min(1, "The file has no rows").max(1000),
  })
  .superRefine((d, ctx) => {
    // Two rows claiming the same Staff ID is a mistake in the file, not a
    // race — catching it here names both offending lines, where catching it
    // at the database would only report whichever lost.
    const seen = new Map<string, number>();
    d.rows.forEach((r, i) => {
      const key = r.staffId.trim().toLowerCase();
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Staff ID "${r.staffId}" is on line ${first + 1} as well`,
          path: ["rows", i, "staffId"],
        });
      } else {
        seen.set(key, i);
      }
    });
  });

export type UserImportRow = z.infer<typeof userImportRowSchema>;

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  staffId: z.string().trim().min(1).max(40).optional(),
  designation: z.string().trim().max(60).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES).optional(),
  territoryIds: z.array(z.string().trim().min(1)).max(20).optional(),
  baseTerritoryId: nullableId,
  // Named postings, as on create. Present, they replace the ids above.
  territoryNames: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  baseTerritoryName: z.string().trim().max(80).optional().or(z.literal("")),
  salesTerritory: z.string().trim().max(80).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
  portalId: nullableId,
});

export const territorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  // Which half of the recovery organisation owns this territory. Nullable:
  // "" clears it back to unassigned.
  part: z.enum(["A", "B"]).nullable().optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(["YARD", "DEPOT", "SHOWROOM", "OTHER"]).default("YARD"),
  isActive: z.boolean().optional(),
});

// Vehicle brands and the models under them — the capture form's pick list.
export const brandSchema = z.object({
  name: z.string().trim().min(1, "Brand name is required").max(60),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const vehicleModelSchema = z.object({
  brandId: z.string().trim().min(1, "Choose a brand"),
  name: z.string().trim().min(1, "Model name is required").max(60),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

export const questionSchema = z.object({
  key: z.string().trim().min(1, "Key is required").max(40).regex(/^[A-Z0-9_]+$/, "Use A–Z, 0–9 and underscore"),
  label: z.string().trim().min(1, "Label is required").max(200),
  requiresNote: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Engineer's repair progress report. The note is optional and short on
 * purpose: this is filed from a phone next to a vehicle, not written at a desk.
 */
/**
 * A progress report.
 *
 * `NOT_STARTED` is still accepted by the shape but refused by the route's
 * ratchet on any live repair — a live repair reads as in progress from the
 * moment it is approved, so there is nothing it can legally be filed from.
 * Left in the enum because the column holds it on older rows and a schema that
 * cannot express its own data is a schema that fails on the way in.
 *
 * The blocker is REQUIRED with AWAITING_PARTS and refused with anything else:
 * "stopped" always has a reason, and a reason attached to "ready" is a reason
 * nobody will ever read. `OTHER` additionally requires the note — "something
 * else is wrong" is not a report — and that pairing is checked here rather
 * than in the route so the rule travels with the shape.
 */
export const repairProgressSchema = z
  .object({
    stage: z.enum(["NOT_STARTED", "IN_PROGRESS", "AWAITING_PARTS", "READY"]),
    blocker: z.enum(["PARTS", "OTHER"]).optional(),
    note: z.string().trim().max(280).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.stage === "AWAITING_PARTS" && !v.blocker) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocker"],
        message: "Say what the repair is waiting on — parts, or another issue.",
      });
    }
    if (v.stage !== "AWAITING_PARTS" && v.blocker) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocker"],
        message: "Only a blocked repair carries a reason.",
      });
    }
    if (v.blocker === "OTHER" && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["note"],
        message: "Say in a line what is holding it up.",
      });
    }
  });

/**
 * The engineer's handover set — the five post-repair photographs.
 *
 * Angles rather than slot names: the caller says "front", and the server maps
 * that to HANDOVER_FRONT. A client that could name the slot directly could
 * name LEFT and write a recovery photograph, which is evidence of the vehicle's
 * condition on the day it was seized and must never be writable from here.
 */
export const handoverSchema = z
  .object({
    shots: z
      .array(
        z.object({
          angle: z.enum(["FRONT", "LEFT", "RIGHT", "BACK", "CABIN"]),
          name: z.string().trim().min(1),
        }),
      )
      .max(5)
      .default([]),
    /** Angles to clear, so a bad shot can be retaken rather than lived with. */
    remove: z.array(z.enum(["FRONT", "LEFT", "RIGHT", "BACK", "CABIN"])).max(5).default([]),
  })
  .refine((d) => d.shots.length > 0 || d.remove.length > 0, {
    message: "Nothing to save",
    path: ["shots"],
  });

// ---------------------------------------------------------------------------
// Capture requests
// ---------------------------------------------------------------------------

/**
 * A request to capture a vehicle, made before the vehicle is taken.
 *
 * Far shorter than `captureSchema`, and that asymmetry is the point. At
 * request time the vehicle is still on the road: there are no photographs to
 * take, no documents to check off and no engineer to assign. What the manager
 * needs is the account position and the officer's read on whether there is any
 * alternative — and both of those an ARO can answer from the file in front of
 * them, which is what makes the request something they will actually raise
 * rather than route around.
 */
export const captureRequestSchema = z.object({
  registrationNo: z.string().trim().min(1, "Registration number is required").max(60),
  customerCode: z.string().trim().min(1, "Customer code is required").max(60),
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  // Brand and model come from the master pick list, like the capture form.
  // Required, as every field on this form now is: a request the manager has to
  // rule on without knowing what the vehicle is is a request that gets ruled on
  // twice. The earlier reasoning — that an officer working off an account
  // statement may not have the model to hand — was a real cost, and the answer
  // is to look it up before asking rather than to leave the field blank.
  brandId: z.string().trim().min(1, "Brand is required"),
  modelId: z.string().trim().min(1, "Model is required"),

  // The account position. Whole instalments overdue, so an integer; the two
  // money figures are floats like every other amount in the system.
  odNumber: z.coerce
    .number({ invalid_type_error: "Current OD # is required" })
    .int("Give a whole number of overdue instalments")
    .min(0)
    .max(1000),
  odAmount: z.coerce
    .number({ invalid_type_error: "Current OD amount is required" })
    .min(0)
    .max(1e12),
  outstandingAmount: z.coerce
    .number({ invalid_type_error: "Outstanding amount is required" })
    .min(0)
    .max(1e12),

  // What the officer expects AFTER the capture: settlement and return, or a
  // Credit Note and resale. No default — "not answered" and "expect no
  // payment" are different facts, and defaulting the first to the second puts
  // the harshest read on a customer nobody actually assessed.
  settlementPossible: z.boolean({
    required_error: "Say what you expect to happen once the vehicle is captured",
  }),

  remarks: z.string().trim().min(1, "Remarks are required").max(2000),
  // The form offers this officer's own patches and preselects their base, so
  // there is nothing to leave blank — see the capture options route.
  territoryId: z.string().trim().min(1, "Territory is required"),
});

export type CaptureRequestInput = z.infer<typeof captureRequestSchema>;

/**
 * The manager's ruling.
 *
 * A decline must carry a reason and an approval need not — the same asymmetry
 * the Credit Note desk already follows. An approval is self-explanatory: the
 * request said why. A refusal is not, and the officer has to know what to do
 * differently.
 */
export const captureRequestDecisionSchema = z
  .object({
    action: z.enum(["APPROVE", "DECLINE", "WITHDRAW"]),
    note: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.action === "DECLINE" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required to decline a capture request",
        path: ["note"],
      });
    }
  });

// ---------------------------------------------------------------------------
// Off-road cases
// ---------------------------------------------------------------------------

/** Photographs on a case: stored upload names, captioned rather than slotted. */
const offroadPhotoSchema = z.object({
  name: z.string().min(1),
  caption: z.string().trim().max(160).optional().or(z.literal("")),
});

/**
 * The fields both kinds of case share.
 *
 * `approxDays` is required on both and is the single most important number on
 * the form: it is what the countdown runs against, and a case without one is a
 * vehicle nobody has committed to getting back. Capped at two years because
 * beyond that the honest answer is that nobody knows, and a five-year estimate
 * makes the whole board's arithmetic meaningless.
 */
const offroadBase = {
  registrationNo: z.string().trim().min(1, "Registration number is required").max(60),
  customerCode: z.string().trim().min(1, "Customer ID is required").max(60),
  customerName: z.string().trim().min(1, "Customer name is required").max(120),
  brandId: z.string().trim().min(1, "Brand is required"),
  modelId: z.string().trim().min(1, "Model is required"),
  mileage: z.string().trim().min(1, "Mileage is required").max(30),
  occurredAt: z.coerce.date({ required_error: "A date is required" }),
  approxDays: z.coerce
    .number({ invalid_type_error: "An estimate in days is required" })
    .int("Give a whole number of days")
    .min(1, "Give at least one day")
    .max(730, "Estimates longer than two years are not meaningful — revise it later instead"),
  remarks: z.string().trim().min(1, "Remarks are required").max(2000),
  // The form offers this officer's own patches and preselects their base, so
  // there is nothing to leave blank — see the capture options route.
  territoryId: z.string().trim().min(1, "Territory is required"),
  // At least one photograph on BOTH kinds. It used to be required only on an
  // accident, on the argument that damage is a judgement needing evidence — but
  // a vehicle in a compound is equally a claim nobody downstream can check, and
  // the officer is standing in front of it either way.
  photos: z.array(offroadPhotoSchema).min(1, "At least one photograph is required"),

  // The account position.
  //
  // Required, like every other field on this form. It was optional because this
  // one is filled at a roadside rather than at a desk with the statement open,
  // and the concern behind that — that requiring it produces three invented
  // numbers, and an invented outstanding is worse than an absent one — is a
  // real one worth knowing about. It is required because the desk ranks cases
  // against each other by exposure, and a case with no exposure on it sorts as
  // though nothing is riding on the vehicle.
  odNumber: requiredAmount("Current OD # is required", 1000),
  odAmount: requiredAmount("Overdue amount is required", 1e12, true),
  outstandingAmount: requiredAmount("Outstanding amount is required", 1e12, true),
};

/**
 * An accident case.
 *
 * At least one photograph is required and that is not bureaucracy: severity is
 * a judgement, the photograph is the evidence for it, and every downstream
 * decision — repair or write off, convert or return — is taken by someone who
 * was not standing at the roadside.
 */
export const accidentCaseSchema = z.object({
  kind: z.literal("ACCIDENT"),
  ...offroadBase,
  accidentSeverity: z.enum(["MINOR", "MODERATE", "MAJOR", "TOTAL_LOSS"], {
    required_error: "Accident condition is required",
    invalid_type_error: "Accident condition is required",
  }),
  accidentNote: z.string().trim().min(1, "Describe the damage").max(2000),
  photos: z
    .array(offroadPhotoSchema)
    .min(1, "At least one photograph of the damage is required"),
});

/**
 * A police-custody case.
 *
 * A plain object, deliberately: `z.discriminatedUnion` only accepts object
 * schemas, and wrapping this branch in its own `.superRefine` turns it into a
 * ZodEffects that the union will not take. The one conditional rule it needs
 * therefore lives on the union below, which is also where a reader looking for
 * "what else is checked" will think to look.
 */
export const thanaCaseSchema = z.object({
  kind: z.literal("THANA"),
  ...offroadBase,
  // Two answers, not the capture form's three.
  //
  // ACCIDENT is deliberately absent: it is a REASON a vehicle is in custody
  // and it is already on `thanaReason`, so offering it here as a condition let
  // the same fact be recorded twice and disagree with itself. What the desk
  // needs from this field is one thing — will the vehicle move under its own
  // power when it is released. ON_ROAD is "running", OFF_ROAD is "not".
  vehicleCondition: z.enum(["ON_ROAD", "OFF_ROAD"], {
    required_error: "Say whether the vehicle is running",
    invalid_type_error: "Say whether the vehicle is running",
  }),
  thanaReason: z.enum(
    ["ACCIDENT", "DRUG_CASE", "ILLEGAL_GOODS", "THEFT", "CUSTOMS", "OTHER"],
    {
      required_error: "A reason is required",
      invalid_type_error: "A reason is required",
    },
  ),
  // Required on every case, not only on OTHER. The dropdown says which kind of
  // case it is; this says what actually happened, and a custody record without
  // it is a category with no facts under it.
  thanaReasonNote: z.string().trim().min(1, "Describe the reason").max(2000),
  thanaName: z.string().trim().min(1, "Thana / police station name is required").max(160),
  vehicleLocation: z.string().trim().min(1, "Where the vehicle is held is required").max(160),
});

/**
 * Either kind, discriminated on `kind`.
 *
 * A union rather than one schema with everything optional, so the server
 * cannot accept a Thana case carrying an accident severity, or an accident
 * with a police station attached. The database columns are nullable because
 * MySQL cannot express "required only when kind = THANA"; this is where that
 * rule is actually enforced.
 */
export const offroadCaseSchema = z
  .discriminatedUnion("kind", [accidentCaseSchema, thanaCaseSchema])
  .superRefine((data, ctx) => {
    // OTHER is the escape hatch, and an escape hatch with nothing written in
    // it records less than the dropdown it bypassed.
    if (data.kind === "THANA" && data.thanaReason === "OTHER" && !data.thanaReasonNote?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Describe the reason when choosing Other",
        path: ["thanaReasonNote"],
      });
    }
  });

export type OffroadCaseInput = z.infer<typeof offroadCaseSchema>;

/**
 * Closing a case, or moving its clock.
 *
 * One schema for four actions because they are one decision point on the UI —
 * a single panel on an open case — and splitting them into four endpoints
 * would have produced four routes that all load the same record and check the
 * same permission.
 */
export const offroadActionSchema = z
  .object({
    action: z.enum([
      "MARK_ONROAD",
      "RELEASE_TO_CUSTOMER",
      "CONVERT_TO_CAPTURE",
      "REVISE_TIMELINE",
    ]),
    note: z.string().trim().max(1000).optional().or(z.literal("")),
    /** REVISE_TIMELINE only. */
    revisedDays: z.coerce.number().int().min(1).max(730).optional(),
    /** CONVERT_TO_CAPTURE only — the NOC the officer confirms they hold. */
    nocReference: z.string().trim().max(120).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.action === "REVISE_TIMELINE" && data.revisedDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Give the revised number of days",
        path: ["revisedDays"],
      });
    }
    // The NOC is the whole control on this action. A vehicle only stops being
    // the customer's because a document says so, and a conversion recorded
    // without one is exactly the gap an audit finds later.
    if (data.action === "CONVERT_TO_CAPTURE" && !data.nocReference?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An NOC reference is required before converting to a capture",
        path: ["nocReference"],
      });
    }
    if (data.action === "RELEASE_TO_CUSTOMER" && !data.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A reason is required when releasing to the customer",
        path: ["note"],
      });
    }
  });

/** Editing the descriptive fields of an open case, without closing it. */
export const offroadEditSchema = z.object({
  occurredAt: z.coerce.date().optional(),
  approxDays: z.coerce.number().int().min(1).max(730).optional(),
  mileage: z.string().trim().max(30).optional(),
  remarks: z.string().trim().min(1).max(2000).optional(),
  accidentSeverity: z.enum(["MINOR", "MODERATE", "MAJOR", "TOTAL_LOSS"]).optional(),
  accidentNote: z.string().trim().max(2000).optional(),
  thanaName: z.string().trim().max(160).optional(),
  vehicleLocation: z.string().trim().max(160).optional(),
  thanaReasonNote: z.string().trim().max(2000).optional(),
  vehicleCondition: z.enum(["ON_ROAD", "OFF_ROAD", "ACCIDENT"]).optional(),
});

// ---------------------------------------------------------------------------
// Case flags
// ---------------------------------------------------------------------------

/**
 * Raise a flag on an open case.
 *
 * The note is required on both kinds and that is the whole design: a flag
 * without a reason is a notification, and a notification the recipient cannot
 * act on is noise they will learn to ignore. Twenty characters is not an
 * arbitrary floor — it is roughly the shortest useful sentence, and it stops
 * "urgent" and "pls check" from counting as an ask.
 */
export const caseFlagSchema = z.object({
  kind: z.enum(["SUPPORT_REQUEST", "ATTENTION"], {
    required_error: "Choose the kind of flag",
    invalid_type_error: "Choose the kind of flag",
  }),
  note: z
    .string()
    .trim()
    .min(20, "Say what is needed — a few words is not enough for anyone to act on")
    .max(1000),
});

/** Close a flag: answered by the other side, or withdrawn by its author. */
export const caseFlagResolveSchema = z.object({
  resolutionNote: z.string().trim().max(1000).optional().or(z.literal("")),
});

// ---------------------------------------------------------------------------
// Direct-capture windows
// ---------------------------------------------------------------------------

/**
 * Opening a window past the approval gate.
 *
 * Every constraint here exists to stop an exception becoming permanent by
 * accident. `closesAt` is required and capped at 60 days out, because a window
 * longer than that is not a backfill, it is a policy change made by filling in
 * a form. The reason has a real floor for the same purpose an off-road flag
 * does: "backlog" tells a reader nothing they could not already guess, and this
 * is the field somebody will be reading in a year when they ask why thirty-one
 * vehicles have no capture request.
 */
export const captureWindowSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(
        20,
        "Say what this window is for — whoever reads it later will not have the context you have now",
      )
      .max(600),
    opensAt: z.coerce.date().optional(),
    closesAt: z.coerce.date({
      required_error: "A window must have a closing date",
      invalid_type_error: "A window must have a closing date",
    }),
    // Uncapped is allowed but never the default — see the model note.
    maxCaptures: z.coerce
      .number()
      .int("Give a whole number of vehicles")
      .min(1, "A window that allows no captures does nothing")
      .max(2000)
      .optional()
      .nullable(),
    territoryId: z.string().trim().optional().or(z.literal("")),
  })
  .refine((v) => v.closesAt > (v.opensAt ?? new Date()), {
    message: "The window must close after it opens",
    path: ["closesAt"],
  })
  .refine((v) => v.closesAt.getTime() - (v.opensAt ?? new Date()).getTime() <= 60 * 86_400_000, {
    message: "Sixty days is the longest a window may run — open another if the work is not done",
    path: ["closesAt"],
  });

/** Shutting a window before its own expiry. The note is why, and is required. */
export const captureWindowCloseSchema = z.object({
  closeNote: z
    .string()
    .trim()
    .min(5, "Say why it is being closed early")
    .max(600),
});

// ---------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------

const PORTAL_MODULE_VALUES = [
  "FLEET_REGISTER",
  "RESALE_PIPELINE",
  "OFFROAD_FLEET",
  "SALES_MARGIN",
  "TERRITORY_SPREAD",
  "REPAIR_WATCH",
  "LETTER_LADDER",
  "RECENT_ACTIVITY",
] as const;

const PORTAL_ACCENT_VALUES = ["INDIGO", "JADE", "GARNET", "OCHRE", "TEAL", "PLUM"] as const;

const PORTAL_GLYPH_VALUES = [
  "COMPASS",
  "CHART",
  "SHIELD",
  "BRIEFCASE",
  "BUILDING",
  "GLOBE",
  "WALLET",
  "CLIPBOARD",
] as const;

/**
 * The module list, on its way into the JSON column.
 *
 * This schema is the reason that column can be trusted: it is the only way a
 * value reaches `modules`, and `parseModules()` on the way out drops anything
 * it does not recognise regardless. Deduplicated here rather than at the
 * database, because a list that names the same panel twice is a client bug and
 * storing it would make every later read carry the mistake.
 */
export const portalModulesSchema = z
  .array(z.enum(PORTAL_MODULE_VALUES))
  .max(PORTAL_MODULE_VALUES.length)
  .transform((list) => [...new Set(list)]);

export const portalCreateSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Give the portal a name its members would recognise")
      .max(80),
    purpose: z.string().trim().max(200).optional().or(z.literal("")),
    modules: portalModulesSchema,
    band: z.enum(["ALL", "CAPTURE", "RESALE"]).default("ALL"),
    // Empty means every territory. An explicit list narrows it.
    territoryIds: z.array(z.string().trim().min(1)).max(100).default([]),
    showCosts: z.boolean().default(false),
    showCustomer: z.boolean().default(false),
    showOffers: z.boolean().default(false),
    showPhotos: z.boolean().default(false),
    accent: z.enum(PORTAL_ACCENT_VALUES).default("INDIGO"),
    glyph: z.enum(PORTAL_GLYPH_VALUES).default("COMPASS"),
    isActive: z.boolean().default(true),
  })
  // A portal with no panels is an account that can sign in and see a title.
  // Refused here rather than allowed and warned about, because the admin is
  // three clicks from fixing it and whoever it gets assigned to is not.
  .refine((v) => v.modules.length > 0, {
    message: "A portal needs at least one panel — otherwise its members see an empty page",
    path: ["modules"],
  });

/**
 * Editing one.
 *
 * Every field optional, so a colour change does not have to resend the
 * composition — but `modules`, if sent at all, still may not be emptied.
 */
export const portalUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    purpose: z.string().trim().max(200).optional().or(z.literal("")),
    modules: portalModulesSchema.optional(),
    band: z.enum(["ALL", "CAPTURE", "RESALE"]).optional(),
    territoryIds: z.array(z.string().trim().min(1)).max(100).optional(),
    showCosts: z.boolean().optional(),
    showCustomer: z.boolean().optional(),
    showOffers: z.boolean().optional(),
    showPhotos: z.boolean().optional(),
    accent: z.enum(PORTAL_ACCENT_VALUES).optional(),
    glyph: z.enum(PORTAL_GLYPH_VALUES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.modules === undefined || v.modules.length > 0, {
    message: "A portal needs at least one panel",
    path: ["modules"],
  });

// ---------------------------------------------------------------------------
// The administrator's records console
// ---------------------------------------------------------------------------

/**
 * A deletion needs a reason, and the reason has to be a sentence.
 *
 * Twelve characters, because "test", "dup" and "wrong" are the three things
 * somebody types when the field is merely required, and none of them answers
 * the question that gets asked six months later. The reason outlives the
 * record — it is the only part of it that does — so it is the one field here
 * worth being awkward about.
 */
export const adminDeleteSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(12, "Say why, in a sentence — this is the only thing that survives the deletion")
    .max(500),
});

/**
 * Correcting a record's identity.
 *
 * Deliberately the identity fields and nothing else. Everything a DESK owns —
 * costs, grades, prices, the stage itself — already has an audited path that
 * enforces its own rules, and the Super Admin can already walk any of them
 * because `canRunAction` lets them run any transition. Reaching around those
 * to write the columns directly would be the one edit in the product that
 * skipped its own state machine.
 *
 * What is left is the class of mistake those paths cannot fix: a registration
 * number typed wrong on a phone in a yard, a customer code off by a digit, a
 * vehicle filed under the wrong territory. Those are transcription errors, not
 * decisions, and they have nowhere else to be corrected.
 */
export const adminCorrectSchema = z
  .object({
    registrationNo: z.string().trim().min(1).max(60).optional(),
    customerName: z.string().trim().min(1).max(120).optional(),
    customerCode: z.string().trim().max(60).optional().or(z.literal("")),
    territoryId: nullableId.optional(),
    reason: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .refine(
    (v) =>
      v.registrationNo !== undefined ||
      v.customerName !== undefined ||
      v.customerCode !== undefined ||
      v.territoryId !== undefined,
    { message: "Nothing to change" },
  );

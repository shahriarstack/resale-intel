import { z } from "zod";

const PHOTO_SLOTS = ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN", "SLEEP"] as const;

export const captureSchema = z
  .object({
    // Identity
    registrationNo: z.string().trim().min(1, "Registration number is required").max(60),
    customerName: z.string().trim().min(1, "Customer name is required").max(120),
    customerCode: z.string().trim().max(60).optional().or(z.literal("")),
    make: z.string().trim().max(60).optional().or(z.literal("")),
    model: z.string().trim().max(60).optional().or(z.literal("")),
    year: z.coerce.number().int().min(1950).max(2100).optional().nullable(),
    mileage: z.string().trim().max(30).optional().or(z.literal("")),

    // Placement
    territoryId: z.string().trim().min(1, "Territory is required"),
    currentLocationId: z.string().trim().min(1, "Current location is required"),
    capturedLocation: z.string().trim().max(160).optional().or(z.literal("")),
    captureDate: z.coerce.date().optional(),

    // Condition
    remarks: z.string().trim().max(2000).optional().or(z.literal("")),
    hasSleeperCabin: z.boolean().default(false),

    // Letter + assignment
    letterStage: z.enum(["NONE", "LETTER_1", "LETTER_2", "LETTER_3", "WRITTEN"]).default("NONE"),
    assignedEngineerId: z.string().trim().min(1, "Assign a service engineer"),

    // Checklist answers
    answers: z
      .array(
        z.object({
          questionId: z.string().min(1),
          answer: z.boolean(),
          note: z.string().trim().max(500).optional().or(z.literal("")),
        }),
      )
      .default([]),

    // Photos — { slot, name } where name is a stored upload name.
    photos: z
      .array(
        z.object({
          slot: z.enum(PHOTO_SLOTS),
          name: z.string().min(1),
        }),
      )
      .min(5, "At least five photos are required"),
  })
  .superRefine((data, ctx) => {
    const slots = new Set(data.photos.map((p) => p.slot));
    for (const required of ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN"] as const) {
      if (!slots.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing the ${required} photo`,
          path: ["photos"],
        });
      }
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
  amount: z.coerce.number().min(0, "Amount cannot be negative").max(1e12),
});

// Service Engineer assessment: repair lines, transport/other cost, and the
// assessment-sheet photos. `submit` moves the file to the Service Head.
export const assessmentSchema = z.object({
  repairLines: z.array(costLineSchema).default([]),
  transportCost: z.coerce.number().min(0).max(1e12).default(0),
  otherCost: z.coerce.number().min(0).max(1e12).default(0),
  newSheetNames: z.array(z.string()).default([]),
  removeSheetIds: z.array(z.string()).default([]),
  submit: z.boolean().default(false),
});

export type AssessmentInput = z.infer<typeof assessmentSchema>;

// Service Head: optionally adjust the engineer's estimate, then approve the
// repair and set the timeframe. `approve:false` saves the adjustment only.
export const repairApprovalSchema = z
  .object({
    approve: z.boolean().default(true),
    repairDays: z.coerce.number().int().min(1, "At least one day").max(365, "At most a year").optional(),
    editCosts: z.boolean().default(false),
    repairLines: z.array(costLineSchema).optional(),
    transportCost: z.coerce.number().min(0).max(1e12).optional(),
    otherCost: z.coerce.number().min(0).max(1e12).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.approve && d.repairDays === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Repair timeframe is required to approve", path: ["repairDays"] });
    }
    if (!d.approve && !d.editCosts) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nothing to save", path: ["editCosts"] });
    }
  });

// Registration Team: itemised registration costs.
export const registrationSchema = z.object({
  lines: z.array(costLineSchema).default([]),
  submit: z.boolean().default(false),
});

// Sr. Executive: the SOP figure (revised monthly), plus the proposed selling
// price when first submitting the file for approval.
export const sopSchema = z.object({
  sopCost: z.coerce.number().min(0, "Cannot be negative").max(1e12),
  price: z.coerce.number().min(0, "Cannot be negative").max(1e12).optional(),
});

// Sr. Executive: condition grade.
export const gradeSchema = z.object({
  grade: z.enum(["A", "B", "C", "D"]),
});

// AGM / DGM: the approved selling price.
export const priceSchema = z.object({
  approvedPrice: z.coerce.number().min(0, "Cannot be negative").max(1e12),
});

// Sales officer: a sealed bid on a live vehicle. The approved price is a guide,
// not a floor — a low offer is accepted and flagged for management to weigh.
export const bidSchema = z.object({
  amount: z.coerce
    .number()
    .positive("Enter an amount above zero")
    .max(1e12, "That amount is too large"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

// GM / Sr. GM: close the sale by awarding one of the standing offers.
export const awardSchema = z.object({
  bidId: z.string().trim().min(1, "Choose the winning bid"),
  note: z.string().trim().max(1000).optional().or(z.literal("")),
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
  territoryId: nullableId,
  password: z.string().min(6, "Password must be at least 6 characters").max(200),
});

export const userUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  staffId: z.string().trim().min(1).max(40).optional(),
  designation: z.string().trim().max(60).optional().or(z.literal("")),
  role: z.enum(ROLE_VALUES).optional(),
  territoryId: nullableId,
  isActive: z.boolean().optional(),
  password: z.string().min(6, "Password must be at least 6 characters").max(200).optional().or(z.literal("")),
});

export const territorySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  code: z.string().trim().max(20).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(["YARD", "DEPOT", "SHOWROOM", "OTHER"]).default("YARD"),
  isActive: z.boolean().optional(),
});

export const questionSchema = z.object({
  key: z.string().trim().min(1, "Key is required").max(40).regex(/^[A-Z0-9_]+$/, "Use A–Z, 0–9 and underscore"),
  label: z.string().trim().min(1, "Label is required").max(200),
  requiresNote: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

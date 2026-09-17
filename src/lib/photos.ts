import type { PhotoSlot } from "@prisma/client";

/**
 * Photographs, and which ones a buyer is actually shown.
 *
 * A vehicle is photographed twice in its life, by two different people, for two
 * different reasons:
 *
 *   RECOVERY — five angles shot by the ARO at capture. Evidence. This is the
 *     vehicle in the state it was taken in, and it is the only record of that
 *     state that will ever exist.
 *
 *   HANDOVER — the same five angles, re-shot by the Service Engineer when the
 *     repair is finished. This is the vehicle as a buyer would collect it.
 *
 * The angles are identical on purpose. It makes the engineer's job legible —
 * "photograph these five, here is what each looked like when it arrived" — and
 * it means the marketplace can swap one set for the other without a listing
 * changing shape or losing a view.
 *
 * The rule the shop window runs on: show the newest true picture of the
 * vehicle, and say which one it is. A repaired vehicle shows the handover set.
 * An as-is vehicle has no handover set — nothing was rebuilt, so there is
 * nothing new to photograph — and shows the recovery set instead, labelled.
 * A repaired vehicle whose engineer has not filed the handover set yet also
 * falls back, and is labelled differently again, because "we have not
 * photographed it since the work" and "we are selling it as it came in" are
 * not the same claim to make to a buyer.
 */

// ---------------------------------------------------------------------------
// The five angles
// ---------------------------------------------------------------------------

export const ANGLES = ["FRONT", "LEFT", "RIGHT", "BACK", "CABIN"] as const;
export type Angle = (typeof ANGLES)[number];

export const ANGLE_LABEL: Record<Angle, string> = {
  FRONT: "Front",
  LEFT: "Left",
  RIGHT: "Right",
  BACK: "Back",
  CABIN: "Cabin",
};

/** What the engineer is being asked to show in each shot. */
export const ANGLE_BRIEF: Record<Angle, string> = {
  FRONT: "Front three-quarter — the shot a buyer forms an impression from",
  LEFT: "Full left side, whole vehicle in frame",
  RIGHT: "Full right side, whole vehicle in frame",
  BACK: "Rear, square on",
  CABIN: "Inside the cab — seats, dash, steering",
};

/** The handover counterpart of a recovery angle. */
export const HANDOVER_OF: Record<Angle, PhotoSlot> = {
  FRONT: "HANDOVER_FRONT",
  LEFT: "HANDOVER_LEFT",
  RIGHT: "HANDOVER_RIGHT",
  BACK: "HANDOVER_BACK",
  CABIN: "HANDOVER_CABIN",
};

export const HANDOVER_SLOTS: PhotoSlot[] = ANGLES.map((a) => HANDOVER_OF[a]);

/** How many photographs close a repair. Five: one per angle, no more, no less. */
export const HANDOVER_REQUIRED = ANGLES.length;

/**
 * Is this stored file a PDF?
 *
 * Lives here rather than in lib/storage because client components ask it and
 * lib/storage imports node:fs. A stored name always carries its real
 * extension — the upload route derives it from the sniffed MIME type, never
 * from what the browser called the file — so the suffix is trustworthy.
 */
export function isPdfName(name: string): boolean {
  return name.toLowerCase().endsWith(".pdf");
}

/** The same check against a served URL (/api/files/<name>). */
export function isPdfUrl(url: string): boolean {
  return isPdfName(url);
}

export function isHandoverSlot(slot: PhotoSlot): boolean {
  return (HANDOVER_SLOTS as string[]).includes(slot);
}

/** The recovery angle a handover slot answers, for pairing them on screen. */
export function angleOfHandover(slot: PhotoSlot): Angle | null {
  return ANGLES.find((a) => HANDOVER_OF[a] === slot) ?? null;
}

// ---------------------------------------------------------------------------
// Progress
// ---------------------------------------------------------------------------

export interface PhotoRef {
  slot: PhotoSlot;
  url: string;
}

export interface HandoverState {
  /** Angles that have a handover shot on file. */
  done: Angle[];
  /** Angles still owed. */
  missing: Angle[];
  complete: boolean;
  /** `3 of 5`, for a progress readout. */
  count: number;
  required: number;
}

export function readHandover(photos: PhotoRef[]): HandoverState {
  const have = new Set(photos.map((p) => p.slot));
  const done = ANGLES.filter((a) => have.has(HANDOVER_OF[a]));
  const missing = ANGLES.filter((a) => !have.has(HANDOVER_OF[a]));
  return {
    done,
    missing,
    complete: missing.length === 0,
    count: done.length,
    required: HANDOVER_REQUIRED,
  };
}

/**
 * The two sets, paired by angle, in the order the engineer shoots them.
 *
 * Returns a row per angle whether or not either photograph exists, so the
 * engineer's screen renders five rows on an empty vehicle and never has to
 * decide what an absent slot looks like.
 */
export function pairByAngle(
  photos: PhotoRef[],
): { angle: Angle; label: string; brief: string; before: string | null; after: string | null }[] {
  return ANGLES.map((angle) => ({
    angle,
    label: ANGLE_LABEL[angle],
    brief: ANGLE_BRIEF[angle],
    before: photos.find((p) => p.slot === angle)?.url ?? null,
    after: photos.find((p) => p.slot === HANDOVER_OF[angle])?.url ?? null,
  }));
}

// ---------------------------------------------------------------------------
// The shop window
// ---------------------------------------------------------------------------

/**
 * Where a listing's photographs came from.
 *
 * Carried alongside the images rather than inferred at the point of display,
 * so every surface that shows a listing tells the buyer the same thing about
 * the same pictures.
 */
export type Provenance = "refurbished" | "as-is" | "pre-repair" | "none";

export interface Gallery {
  /** Ordered image URLs. Front first — it is the shot an impression forms on. */
  shots: string[];
  provenance: Provenance;
}

export const PROVENANCE_META: Record<
  Provenance,
  { label: string; blurb: string; tone: "ok" | "warn" | "neutral" }
> = {
  refurbished: {
    label: "After refurbishment",
    blurb: "Photographed by the service engineer once the repair was signed off.",
    tone: "ok",
  },
  "as-is": {
    label: "Sold as is",
    blurb: "No repair was carried out. These are the photographs taken when the vehicle was recovered.",
    tone: "warn",
  },
  "pre-repair": {
    label: "Recovery photos",
    blurb: "Taken at recovery. The refurbishment photographs have not been filed yet.",
    tone: "neutral",
  },
  none: {
    label: "No photographs",
    blurb: "Nothing has been photographed for this vehicle.",
    tone: "neutral",
  },
};

/** Paperwork. Never a shop window image, whatever else is missing. */
const DOCUMENTS: PhotoSlot[] = ["ASSESSMENT_SHEET", "APPROVAL_SHEET", "REGISTRATION_DOC", "CAPTURE_FORM"];

/**
 * Build a listing gallery.
 *
 * Handover shots win outright when the set is complete: a buyer looking at a
 * repaired vehicle should not be shown the wreck it arrived as. A PARTIAL
 * handover set is deliberately not mixed with recovery shots — half-repaired
 * and half-wrecked in one carousel is the most misleading arrangement
 * available, so an incomplete set falls back wholesale and says so.
 */
export function buildGallery(photos: PhotoRef[], asIs: boolean): Gallery {
  const handover = readHandover(photos);

  if (!asIs && handover.complete) {
    return {
      shots: ANGLES.map((a) => photos.find((p) => p.slot === HANDOVER_OF[a])!.url),
      provenance: "refurbished",
    };
  }

  const recovery: string[] = [];
  for (const angle of ANGLES) {
    for (const p of photos.filter((x) => x.slot === angle)) recovery.push(p.url);
  }
  // The sleeper cabin is a real angle, just not one every vehicle has.
  for (const p of photos.filter((x) => x.slot === "SLEEP")) recovery.push(p.url);

  if (recovery.length === 0) {
    return { shots: [], provenance: "none" };
  }
  return { shots: recovery, provenance: asIs ? "as-is" : "pre-repair" };
}

/** The single image a card or a row shows. */
export function heroShot(photos: PhotoRef[], asIs: boolean): string | null {
  const g = buildGallery(photos, asIs);
  if (g.shots.length > 0) return g.shots[0];
  // A card would rather show paperwork than an empty frame; a gallery would not.
  return photos.find((p) => !DOCUMENTS.includes(p.slot))?.url ?? null;
}

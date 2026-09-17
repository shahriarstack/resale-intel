/**
 * The field panel's illustration set.
 *
 * These replaced the monochrome stroke glyphs on every card and tile in the ARO
 * panel. A glyph borrows its meaning from whatever is tinting it, so it says
 * nothing until you have already read the label — and at 16px single-weight on
 * a cheap phone in daylight it is a smudge. These carry their own colour and
 * read the same on any surface.
 *
 * PROFESSIONAL FLAT, not illustrative. The distinction is worth stating because
 * the first version got it wrong: it had starbursts, sparkles, highlight dots
 * on the wheels and a wax seal with a tick in it. That reads as a sticker set,
 * and a sticker set on a repossession record makes the record look unserious.
 *
 * The rules that produce the restrained version:
 *
 *   - Filled geometry only. No strokes, no outlines, no motion lines.
 *   - One hue in two or three values, plus at most one accent shape where the
 *     accent IS the meaning (the beacon on a police station, the fracture on a
 *     damaged wing). Never an accent for decoration.
 *   - Nothing tilted, nothing bouncing, no shape that exists to be charming.
 *   - Square-on elevations rather than three-quarter views: an elevation is
 *     what a technical drawing uses, and it survives being shrunk.
 *
 * All are drawn on a 48×48 grid and scale from one `size` prop. Decorative by
 * definition — each sits beside a visible text label — so all are hidden from
 * the accessibility tree.
 */

interface ArtProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 30,
  className,
  children,
}: ArtProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Capture — a box truck in side elevation. Indigo, the pipeline's colour. */
export function TruckArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="15" width="23" height="17" rx="2" fill="#4338ca" />
      <path d="M27 20h8a2 2 0 0 1 1.6.8L41 27v5H27V20Z" fill="#6366f1" />
      <rect x="29.5" y="22.5" width="6.5" height="4.5" rx="1" fill="#c7d2fe" />
      <rect x="4" y="32" width="37" height="2" fill="#312e81" />
      <circle cx="13" cy="35.5" r="3.6" fill="#1e1b4b" />
      <circle cx="34" cy="35.5" r="3.6" fill="#1e1b4b" />
    </Svg>
  );
}

/**
 * Accident — the same elevation, with the front wing folded. Slate.
 *
 * Drawn in neutral greys rather than the amber it once wore, so the red
 * fracture is the only chromatic mark on it. That is an improvement on the
 * original as well as a palette decision: an amber truck with a red break
 * put two warm hues in competition, and the break — which is the whole
 * reading — had to fight the bodywork to be seen.
 */
export function CrashArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="15" width="21" height="17" rx="2" fill="#475569" />
      {/* The wing is drawn short and stepped rather than square — the damage
          is in the silhouette, not in an effect laid over it. */}
      <path d="M25 20h6.5l3 3.5-2.5 3 3 5.5H25V20Z" fill="#64748b" />
      <rect x="27" y="22.5" width="5" height="4" rx="1" fill="#e2e8f0" />
      <rect x="4" y="32" width="31" height="2" fill="#334155" />
      <circle cx="12" cy="35.5" r="3.6" fill="#1e293b" />
      <circle cx="30" cy="35.5" r="3.6" fill="#1e293b" />
      {/* One fracture. It is the only red on the drawing, and it is the
          reading — this vehicle is broken, not merely off the road. */}
      <path d="M33.5 12.5l-2.5 5h4l-3 6" stroke="#c42847" strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </Svg>
  );
}

/**
 * Thana / custody — a police badge. Deep cyan on navy.
 *
 * The station elevation this replaced was the weakest drawing in the set: at
 * 23px a building with six windows is a grid of dots, and a building says
 * "office" long before it says "police". A badge is the one law-enforcement
 * mark that is unambiguous at any size, and its silhouette alone carries the
 * meaning — which is the test a 23px drawing has to pass.
 */
export function PoliceArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <path d="M24 4 40 9v15c0 9.5-6.4 16.6-16 20-9.6-3.4-16-10.5-16-20V9l16-5Z" fill="#0e7490" />
      <path d="M24 8.6 35.5 12.2V24c0 7.2-4.6 12.7-11.5 15.6V8.6Z" fill="#155e75" />
      {/* Five-point star, drawn as a filled polygon so it holds at any size. */}
      <path d="M24 13.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5-5.9-3.1-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9 2.9-6Z" fill="#a5f3fc" />
    </Svg>
  );
}

/** Capture request — a document with a pending marker. Violet. */
export function RequestArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <path d="M10 8h16.5L34 15.5V40H10V8Z" fill="#6d28d9" />
      <path d="M26.5 8 34 15.5h-7.5V8Z" fill="#c4b5fd" />
      <rect x="15" y="19" width="14" height="2" fill="#ddd6fe" />
      <rect x="15" y="24" width="14" height="2" fill="#ddd6fe" />
      <rect x="15" y="29" width="9" height="2" fill="#a78bfa" />
      {/* A half-filled bar, not a clock face: this is a request part-way
          through a decision, and a bar says that without adding a second
          object to a 48px drawing. */}
      <rect x="15" y="34" width="14" height="2.5" fill="#4c1d95" />
      <rect x="15" y="34" width="6" height="2.5" fill="#a78bfa" />
    </Svg>
  );
}

/** Letters — an envelope with a franking bar. Garnet. */
export function LetterArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="13" width="38" height="23" fill="#a82239" />
      <path d="M5 13h38L24 27 5 13Z" fill="#c42847" />
      <path d="M5 13 24 27 43 13v2.6L24 29.6 5 15.6V13Z" fill="#f2b4b7" />
      {/* The frank: three stacked bars, the way a served notice is stamped. */}
      <rect x="30" y="30" width="9" height="1.6" fill="#f2b4b7" />
      <rect x="30" y="32.6" width="9" height="1.6" fill="#f2b4b7" />
      <rect x="9" y="30" width="6" height="4.2" fill="#5f1424" />
    </Svg>
  );
}

/**
 * A flag raised by the desk. Orange pennant on a slate staff.
 *
 * Follows the warn token rather than the garnet the other attention drawings
 * use: a raised flag is "someone is waiting on you", not "this file failed",
 * and those must not look the same at a glance. Deep, not a soft tint — the
 * pale versions of this drawing read as decoration rather than a summons.
 */
export function FlagArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <rect x="12" y="8" width="3" height="32" fill="#334155" />
      <path d="M15 10h22l-5.5 6.5L37 23H15V10Z" fill="#c2410c" />
      <path d="M15 10h8v13h-8V10Z" fill="#d4551a" />
      <rect x="9" y="38" width="9" height="2.5" fill="#334155" />
    </Svg>
  );
}

/** A window that has run out. Deep garnet, square hands, no motion lines. */
export function OverdueArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <circle cx="24" cy="24" r="17" fill="#a82239" />
      <circle cx="24" cy="24" r="13" fill="#f2b4b7" />
      <rect x="22.8" y="14" width="2.4" height="11" fill="#891f32" />
      <rect x="24" y="22.8" width="8.5" height="2.4" fill="#891f32" />
      <circle cx="24" cy="24" r="1.8" fill="#891f32" />
      <rect x="23" y="7.5" width="2" height="3" fill="#891f32" />
      <rect x="23" y="37.5" width="2" height="3" fill="#891f32" />
    </Svg>
  );
}

/** Approved and ready to act on. Emerald. */
export function ApprovedArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <circle cx="24" cy="24" r="17" fill="#00875a" />
      <circle cx="24" cy="24" r="13" fill="#ceeedc" />
      <path d="M17 24.5l5 5 9-10" stroke="#00875a" strokeWidth="3.2" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </Svg>
  );
}

/**
 * Nothing outstanding. An empty tray.
 *
 * Not a shield: the Thana badge is a shield now, and two shields on one screen
 * with different meanings is worse than no illustration at all. An empty tray
 * says "there is nothing in here", which is exactly the state.
 */
export function ClearArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <path d="M8 24h9l3 5h8l3-5h9v13a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V24Z" fill="#00875a" />
      <path d="M11 10h26l3 14h-9l-3 5h-8l-3-5H8l3-14Z" fill="#00a870" />
      <path d="M18.5 16.5l3.5 3.5 7-7.5" stroke="#e4f5ed" strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter" fill="none" />
    </Svg>
  );
}

/** Files sitting at other desks. A stack in cool blue. */
export function PipelineArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <rect x="7" y="29" width="34" height="7" fill="#1e3a8a" />
      <rect x="10" y="21" width="28" height="7" fill="#2563eb" />
      <rect x="13" y="13" width="22" height="7" fill="#93c5fd" />
    </Svg>
  );
}

/**
 * The whole off-road book. A truck inside a hazard triangle.
 *
 * Red, not amber. A roadside warning triangle genuinely is red, so the colour
 * is the object rather than a tone applied to it — and it keeps the drawing
 * out of the orange-brown family the rest of this set has been cleared of.
 */
export function OffroadArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <path d="M24 7 43 39H5L24 7Z" fill="#c42847" />
      <path d="M24 14.5 37 36H11l13-21.5Z" fill="#f2b4b7" />
      <rect x="15" y="26" width="9" height="6" fill="#891f32" />
      <path d="M24 27.5h3.5l2.5 2.5v2H24v-4.5Z" fill="#a82239" />
      <circle cx="18.5" cy="33" r="1.8" fill="#5f1424" />
      <circle cx="28" cy="33" r="1.8" fill="#5f1424" />
    </Svg>
  );
}

/**
 * The whole book, off the road. A road running to the horizon.
 *
 * Reads on the deep indigo block as well as on a plate, which the others do
 * not: it is drawn in two values of white rather than in a hue, so it takes
 * its colour from whatever it is laid on.
 */
export function RoadArt(props: ArtProps) {
  return (
    <Svg {...props}>
      <path d="M14 42 20 8h8l6 34H14Z" fill="currentColor" opacity="0.32" />
      <rect x="22.6" y="11" width="2.8" height="5" fill="currentColor" />
      <rect x="22.4" y="19" width="3.2" height="6" fill="currentColor" />
      <rect x="22.1" y="28" width="3.8" height="7" fill="currentColor" />
    </Svg>
  );
}

/**
 * The hero mark: a vehicle held, seen square on.
 *
 * Replaces `RoadArt` on the summary block. That drawing was a road running to
 * the horizon, and it had the failure this file already diagnoses elsewhere:
 * at the size it is actually rendered it is a thin wedge with three dashes in
 * it, which is a texture rather than a subject. The figure beside it counts
 * VEHICLES, so the mark should be one.
 *
 * A front elevation rather than the side view `TruckArt` uses — partly so the
 * two are not the same drawing at two sizes, and partly because face-on is
 * the more stable silhouette when a shape has to carry a 52px block on its
 * own. Cab, screen, grille bar, two lamps, two tyres: six masses, none under
 * 3px, which is the test a drawing has to pass here.
 *
 * The plinth beneath is the whole reading. The wheels sit ON a bar rather
 * than on nothing, and the bar is what says this vehicle is standing rather
 * than travelling — the "off the road" the label states in words.
 *
 * Drawn in values of `currentColor` rather than in a hue, like `RoadArt`
 * before it, so it takes its colour from whatever surface it is laid on. On
 * the summary block that is white on the house gradient.
 */
export function FleetHeldArt(props: ArtProps) {
  return (
    <Svg {...props}>
      {/* Box body. The largest mass and the brightest, so the silhouette is
          established before any detail is read. */}
      <rect x="4" y="13" width="22" height="18" rx="2" fill="currentColor" opacity="0.95" />
      {/* Bonnet, set two values down and separated from the body by a 1px
          gap. The gap is doing real work: with only white to draw in, the
          gradient showing through IS the panel line. */}
      <path d="M27 19h7.5a2 2 0 0 1 1.6.8L40 26v5H27V19Z" fill="currentColor" opacity="0.6" />
      {/* Cab window — the darkest value, which on this surface means the most
          gradient showing through. */}
      <rect x="29" y="21.5" width="6" height="4.5" rx="1" fill="currentColor" opacity="0.32" />
      {/* Chassis line, full strength: it is the edge the whole drawing sits on
          and the thing that keeps body and bonnet reading as one vehicle. */}
      <rect x="4" y="31.5" width="36" height="2" fill="currentColor" />
      <circle cx="12.5" cy="35.4" r="3.5" fill="currentColor" />
      <circle cx="33" cy="35.4" r="3.5" fill="currentColor" />
      {/* The plinth, and the whole reading: the wheels stand ON something.
          A vehicle drawn on nothing is a vehicle in transit; this one is
          parked, which is what "off the road" means. Held back to 0.38 so it
          reads as ground rather than as another part of the truck. */}
      <rect x="3" y="41" width="42" height="2.6" rx="1.3" fill="currentColor" opacity="0.38" />
    </Svg>
  );
}

/** The four intakes, keyed by the route they start. */
export const INTAKE_ART = {
  request: RequestArt,
  capture: TruckArt,
  accident: CrashArt,
  thana: PoliceArt,
} as const;

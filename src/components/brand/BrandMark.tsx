import Image from "next/image";

/**
 * The two marks this app wears, and the rule for which goes where.
 *
 * RESALE INTEL owns the product positions — the tab favicon, the top-left of
 * every panel, the home-screen icon. It is a circular badge, which is what
 * lets it survive being scaled to 28px in a sidebar head and still read as a
 * shape rather than a smudge.
 *
 * ACI MOTORS is the parent, and sits in the corner the way a maker's plate
 * does: small, top-right, present but not competing. Its wordmark is BLACK in
 * the supplied artwork, so it is only ever placed on light surfaces — never
 * over the marketplace's accent band or any dark panel.
 *
 * Neither mark is ever recoloured. Both are registered artwork and their
 * greens and blues are not ours to reinterpret, which is also why they are the
 * only things on screen allowed outside the indigo palette.
 */

/** The Resale Intel badge on its own. The product icon. */
export function ResaleBadge({
  size = 28,
  className = "",
  priority = true,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      // 192px, not the 1254px original.
      //
      // THE BIGGEST USE OF THIS MARK ON ANY SCREEN IS 54px. `resale-logo.png`
      // is 1.59 MB — it was being served at full size to render a 38px badge on
      // the sign-in screen and a 28px one in every top bar, which on a phone in
      // a yard is a megabyte and a half of a logo before the page has said
      // anything. Next's optimiser would have resized it, but the optimiser
      // needs `sharp` on the server and this deployment does not have it (see
      // `images.unoptimized` in next.config.ts). Shipping an asset that is
      // already the right size needs neither.
      src="/brand/resale-mark-192.png"
      alt="Resale Intel"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
      priority={priority}
    />
  );
}

/**
 * The ACI Motors lockup — green badge plus wordmark — sized by height, since
 * it is a wide horizontal mark rather than a square one.
 */
export function AciMotorsMark({
  height = 18,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  // 320 × 98, the small cut. Same reasoning as the badge above: the original
  // is 1015 × 311 and 182 KB, and the mark is never drawn taller than 17px.
  const width = Math.round(height * (320 / 98));
  return (
    <Image
      src="/brand/aci-motors-sm.png"
      alt="ACI Motors"
      width={width}
      height={height}
      className={className}
      style={{ width, height, objectFit: "contain" }}
    />
  );
}

/**
 * The parent mark as it appears in the top-right of a panel.
 *
 * Deliberately quiet: reduced opacity that lifts on hover. It is an
 * attribution, not a control, so it should be findable without ever pulling
 * the eye away from the work — and the mark says "ACI Motors" on its own, so
 * it needs no caption explaining that it is a mark.
 */
export function AciCorner({ className = "" }: { className?: string }) {
  return (
    <span className={`aci-corner ${className}`}>
      <AciMotorsMark height={17} />
    </span>
  );
}

/**
 * The product lockup used in app chrome: the Resale Intel badge, the product
 * name beside it, and the viewer's role beneath.
 */
export function ProductMark({
  role,
  compact = false,
  dense = false,
}: {
  role?: string;
  compact?: boolean;
  /**
   * The field shell's top bar, which is pinned over every screen on a phone
   * and so is charged rent for every pixel it takes.
   *
   * A prop rather than a CSS override because the badge's size is an inline
   * `width`/`height` on a next/image — a stylesheet cannot reach it. And a
   * prop rather than a smaller default because the desk sidebar renders the
   * same component in a 264px rail where there is room and nothing to gain
   * from shrinking it.
   */
  dense?: boolean;
}) {
  if (compact) return <ResaleBadge size={28} />;

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <ResaleBadge size={dense ? 26 : 31} className="shrink-0" />
      <span className="min-w-0">
        {/* The one place the product name appears in chrome, so it is the
            one place the ramp runs. See `.brand-grad` in globals.css. */}
        <span
          className={`brand-grad block truncate font-display font-bold leading-none tracking-tight ${
            dense ? "text-[16px]" : "text-[19px]"
          }`}
        >
          Resale Intel
        </span>
        {role && (
          <span
            className={`block truncate font-mono uppercase tracking-[0.14em] text-accent ${
              dense ? "mt-0.5 text-[8.5px]" : "mt-1 text-[9.5px]"
            }`}
          >
            {role}
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * ACI as the subject rather than the parent — the login panel, where the
 * company is who you are signing in to.
 */
export function AciLockup({
  size = 30,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return <AciMotorsMark height={size} className={className} />;
}

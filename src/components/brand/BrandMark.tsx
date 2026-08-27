import Image from "next/image";

/**
 * ACI Motors brand marks.
 *
 * The supplied logo is a horizontal lockup: a green circular badge plus a
 * BLACK "ACI Motors" wordmark. The black wordmark is unusable on the app's
 * dark surfaces and on the dark login panel, so the raster is cropped down to
 * the badge alone (public/brand/aci-badge.png) and the wordmark is re-set in
 * the app's own display face. That way the type inherits `currentColor` and
 * reads correctly in both themes, while the badge stays pixel-accurate.
 *
 * The badge is never recoloured. It is another company's registered mark and
 * its green (#00a966) is not ours to reinterpret — which is also why it is the
 * one thing on screen allowed to sit outside the indigo palette.
 */

export function AciBadge({
  size = 24,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src="/brand/aci-badge.png"
      alt="ACI Motors"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
      priority
    />
  );
}

/**
 * Badge + "ACI MOTORS" wordmark. Used where ACI is the subject — the login
 * panel — rather than where the product is.
 */
export function AciLockup({
  size = 30,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <AciBadge size={size} />
      <span
        className="font-display font-bold leading-none tracking-tight"
        style={{ fontSize: size * 0.62 }}
      >
        ACI Motors
      </span>
    </span>
  );
}

/**
 * The product lockup used in app chrome: the ACI badge in the product-icon
 * position, the product name beside it, and the viewer's role beneath.
 *
 * Putting the badge where a product icon goes is deliberate — this is an
 * internal ACI system, so the parent mark IS the product mark. It also means
 * the one green element on screen is anchored in a corner rather than floating
 * loose in a violet interface.
 */
export function ProductMark({
  role,
  compact = false,
}: {
  role?: string;
  compact?: boolean;
}) {
  if (compact) return <AciBadge size={28} />;

  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <AciBadge size={30} className="shrink-0" />
      <span className="min-w-0">
        <span className="block truncate font-display text-[19px] font-bold leading-none tracking-tight text-ink">
          Resale Intel
        </span>
        {role && (
          <span className="mt-1 block truncate font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent">
            {role}
          </span>
        )}
      </span>
    </span>
  );
}

import { ResaleBadge } from "@/components/brand/BrandMark";

/**
 * What a suspended route shows.
 *
 * Not a spinner. A spinner says "something is happening somewhere"; this says
 * which product is doing it — the more reassuring answer when the wait is a
 * database round trip rather than a hang.
 *
 * It shares the wordmark's blue-purple-green ramp, so the loader reads as the
 * same brand at work rather than as generic chrome borrowed from elsewhere.
 */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="pl" role="status" aria-live="polite">
      <span className="pl-badge">
        <ResaleBadge size={54} priority={false} />
      </span>
      <span className="pl-name brand-grad" data-busy="true">
        Resale Intel
      </span>
      <span className="pl-track" aria-hidden="true" />
      <span className="pl-caption">{label}</span>
    </div>
  );
}

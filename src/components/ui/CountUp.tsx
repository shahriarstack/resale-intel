"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void): () => void {
  const mq = window.matchMedia?.(REDUCED_MOTION);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}

const readMotion = () => window.matchMedia?.(REDUCED_MOTION).matches ?? false;
const motionOnServer = () => false;

/**
 * The OS reduced-motion setting, read as what it is: an external store that
 * can change while the page is open.
 *
 * Asking `matchMedia` inside the tween effect and calling setState on the
 * answer made "should this animate" a piece of component state, which it is
 * not — it is a fact about the machine. Subscribing means the figure also
 * responds if the setting is changed mid-session.
 */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, motionOnServer);
}

/**
 * Animate a numeric value on mount / value-change with an ease-out curve.
 *
 * Formatting stays with the caller — the hook only tweens the raw number so
 * the same helper works for integers, taka, percentages, whatever.
 */
export function useCountUp(
  target: number,
  { duration = 520, decimals = 0 }: { duration?: number; decimals?: number } = {},
): number {
  // No tween wanted at all. Returned straight from render rather than written
  // into state by an effect, so there is no cascading update and no frame
  // where a reduced-motion user sees the placeholder zero.
  const still = usePrefersReducedMotion() || duration <= 0;

  const [value, setValue] = useState(0);
  const from = useRef(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    // No `typeof window` guard here: effects do not run during server
    // rendering, so the branch that used to sit here was unreachable. The
    // server pass renders the initial 0, which is why the component below
    // carries suppressHydrationWarning.
    if (still) return;

    // A hidden tab does not run requestAnimationFrame, so the tween would
    // never start and every figure would sit at its initial 0 until the tab
    // was focused. Opening the dashboard in a background tab is ordinary
    // (middle-click, session restore), and showing a wrong number is far worse
    // than skipping an animation — so land on the value without tweening.
    //
    // Scheduled rather than set inline: an update queued from a callback is an
    // ordinary render, where the same call in the effect body is the
    // synchronous cascade React asks us not to write.
    if (document.hidden) {
      const settle = setTimeout(() => setValue(target), 0);
      return () => clearTimeout(settle);
    }

    from.current = value;
    start.current = null;
    if (raf.current !== null) cancelAnimationFrame(raf.current);

    const step = (now: number) => {
      if (start.current === null) start.current = now;
      const t = Math.min(1, (now - start.current) / duration);
      // ease-out-quart — same feel as our card transitions.
      const eased = 1 - Math.pow(1 - t, 4);
      const next = from.current + (target - from.current) * eased;
      setValue(t === 1 ? target : roundTo(next, decimals));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };

    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    };
    // Re-run on target change; `value` is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, decimals, still]);

  return still ? target : value;
}

function roundTo(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

/** Convenience component: renders the animated integer count. */
export function CountUp({
  value,
  duration,
  className,
  format,
}: {
  value: number;
  duration?: number;
  className?: string;
  format?: (n: number) => string;
}) {
  const v = useCountUp(value, { duration });
  return (
    <span className={className} suppressHydrationWarning>
      {format ? format(v) : Math.round(v).toLocaleString("en-BD")}
    </span>
  );
}

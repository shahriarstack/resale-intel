"use client";

import { useEffect, useRef, useState } from "react";

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
  const [value, setValue] = useState(0);
  const from = useRef(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      setValue(target);
      return;
    }

    // Respect the OS reduced-motion setting — jump straight to the value.
    const reduce =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduce || duration <= 0) {
      setValue(target);
      return;
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
  }, [target, duration, decimals]);

  return value;
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

// Bangladeshi Taka, whole numbers, with the local grouping (lakh/crore reads
// fine in standard grouping for these amounts). Kept dependency-free.

const bdt = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 0,
});

export function taka(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `Tk ${bdt.format(Math.round(n))}`;
}

export function number(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return bdt.format(n);
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Days remaining until a deadline; negative when overdue. null when unset. */
export function daysUntil(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime() - Date.now();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

/** Whole days elapsed since a date. null when unset. */
export function daysSince(d: Date | string | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

/** Compact relative time for feeds — "just now", "4h ago", "3d ago". */
export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/**
 * Compact money with NO currency prefix — "1.2 Cr", "45.0 L", "2.5k".
 *
 * For a surface where every figure is money in the same currency. Repeating
 * "Tk" on forty cells in a table is noise the reader has already skipped: the
 * unit belongs in the heading once, and the cells belong to the numbers, which
 * is what the eye is actually comparing down a column.
 *
 * Same magnitude breaks as `takaCompact`, so the two never disagree about
 * whether a figure reads in lakh or crore. Use `takaCompact` anywhere the
 * currency is NOT already established by the surrounding context.
 */
export function compact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${bdt.format(Math.round(abs))}`;
}

/**
 * Money in millions, with no currency prefix — "79.40", "1.88", "<0.01".
 *
 * ONE unit for the whole surface, not a scale that switches between lakh,
 * crore and thousand depending on magnitude. A column that renders "1.76 Cr"
 * next to "96.60 L" cannot be read down: the eye has to convert every row
 * before it can rank two of them, and the bigger-looking number is routinely
 * the smaller one. Fixed to millions, every figure on the page is directly
 * comparable to every other and the unit is stated once in the heading.
 *
 * Two decimals throughout, for the same reason — a column of ragged precision
 * cannot be scanned. Below the point where two decimals would round to zero it
 * says "<0.01" rather than "0.00", because a real cost of a few thousand taka
 * is not nothing and must not be reported as nothing.
 */
export function millions(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  if (n === 0) return "0";
  const m = n / 1_000_000;
  if (Math.abs(m) < 0.005) return n < 0 ? "-<0.01" : "<0.01";
  return m.toFixed(2);
}

/** Large money in compact form for KPI tiles — "Tk 1.2 Cr", "Tk 45.0 L". */
export function takaCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 10_000_000) return `${sign}Tk ${(abs / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `${sign}Tk ${(abs / 100_000).toFixed(2)} L`;
  if (abs >= 1_000) return `${sign}Tk ${(abs / 1_000).toFixed(1)}k`;
  return `${sign}Tk ${bdt.format(Math.round(abs))}`;
}

/**
 * A span of time at the precision a workshop actually talks in.
 *
 * Days alone are too coarse to run a repair against: "2 days left" reads the
 * same at 09:00 on Monday and 23:00 on Tuesday, and those are very different
 * situations for the person holding the spanner. So days carry hours, and
 * anything under a day drops to hours and minutes.
 *
 * Always returns a magnitude — never a sign. Whether a span is elapsed,
 * remaining or overdue is the caller's context to label, not a minus sign's.
 */
export function duration(ms: number): string {
  const total = Math.abs(ms);
  const mins = Math.floor(total / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const m = mins % 60;
    return m ? `${hours}h ${m}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${days}d ${h}h` : `${days}d`;
}

/** Whole hours in a span, for thresholds and averages. */
export function hoursBetween(a: Date | string, b: Date | string): number {
  const from = typeof a === "string" ? new Date(a) : a;
  const to = typeof b === "string" ? new Date(b) : b;
  return (to.getTime() - from.getTime()) / 3_600_000;
}

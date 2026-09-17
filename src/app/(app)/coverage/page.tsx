import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { getCoverage, parseRange } from "@/lib/coverage";
import { CoverageTable } from "@/components/coverage/CoverageTable";

export const dynamic = "force-dynamic";

/**
 * Territory coverage.
 *
 * Open to the four desks that think geographically. The Recovery Manager runs
 * the field split into parts; the Sr. Executive and AGM value the book by
 * territory; the admin watches the whole thing.
 *
 * The role gate is repeated here rather than left to the nav: the nav decides
 * what is offered, this decides what is allowed, and a route that trusts its
 * own menu is not access control.
 */
const ALLOWED: Role[] = ["SUPER_ADMIN", "RECOVERY_MANAGER", "AGM_DGM", "SR_EXECUTIVE"];

/**
 * Who sees the approved-value column.
 *
 * The Recovery Manager's job ends at the Credit Note — they never set or
 * approve a price, so the resale value of their territories is not theirs to
 * read. Everyone else on this page prices or oversees pricing.
 */
const VALUE_ROLES: Role[] = ["SUPER_ADMIN", "AGM_DGM", "SR_EXECUTIVE"];

export default async function CoveragePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!ALLOWED.includes(user.role)) redirect("/dashboard");

  // The date range lives in the URL rather than in component state. The counts
  // are aggregates computed in the database, so narrowing the window has to be
  // a server round trip — and putting it in the URL makes a filtered view
  // shareable and survives a refresh, which component state would not.
  const { from, to } = await searchParams;
  const range = parseRange(from, to);
  const { rows, unmanned } = await getCoverage(range);

  return (
    <CoverageTable
      rows={rows}
      unmanned={unmanned}
      canSeeValue={VALUE_ROLES.includes(user.role)}
      from={range.from ? toInputValue(range.from) : ""}
      to={range.to ? toInputValue(range.to) : ""}
    />
  );
}

/** `<input type="date">` wants YYYY-MM-DD in local time, not an ISO instant. */
function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

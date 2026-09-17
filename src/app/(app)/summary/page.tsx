import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { getCoverage, parseRange } from "@/lib/coverage";
import { getEngineerWorkload } from "@/lib/repairs";
import { SummaryTabs } from "@/components/summary/SummaryTabs";

export const dynamic = "force-dynamic";

/**
 * Whole-book summary, by territory and by engineer.
 *
 * The BM signs the last approval before a vehicle reaches the market, so they
 * are the one desk whose question spans every other desk at once. Super Admin
 * sees it as part of general oversight.
 *
 * Gated here as well as in the nav: the nav decides what is offered, this
 * decides what is allowed.
 */
const ALLOWED: Role[] = ["SUPER_ADMIN", "GM_SR_GM"];

export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!ALLOWED.includes(user.role)) redirect("/dashboard");

  const { from, to } = await searchParams;
  const range = parseRange(from, to);

  // Both readings share the same window, so they go out together.
  const [{ rows, unmanned }, workload] = await Promise.all([
    getCoverage(range),
    getEngineerWorkload(range),
  ]);

  return (
    <SummaryTabs
      rows={rows}
      unmanned={unmanned}
      workload={workload}
      from={range.from ? toDateInput(range.from) : ""}
      to={range.to ? toDateInput(range.to) : ""}
    />
  );
}

/** `<input type="date">` wants local YYYY-MM-DD, not an ISO instant. */
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

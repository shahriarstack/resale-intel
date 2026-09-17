import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canViewSalesMargin } from "@/lib/rbac";
import { getResalePnl } from "@/lib/resalePnl";
import { SalesMarginBoard } from "@/components/pnl/SalesMarginBoard";

// The book closes as sales are awarded, so a cached render would report
// yesterday's total as today's.
export const dynamic = "force-dynamic";

/**
 * The realised resale book, for the three desks measured by it.
 *
 * Gated here as well as in the nav: the nav decides what is offered, this
 * decides what is allowed. Cost and realised price are commercial facts that
 * stop at the marketplace boundary everywhere else in this product, and a
 * report is not a reason to open a hole in that.
 */
export default async function SalesMarginPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewSalesMargin(user.role)) redirect("/dashboard");

  const data = await getResalePnl();
  return <SalesMarginBoard data={data} />;
}

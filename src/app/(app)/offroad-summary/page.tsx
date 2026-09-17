import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canViewOffroadSummary } from "@/lib/rbac";
import { getManagerBook } from "@/lib/recoveryDesk";
import { summariseByTerritory } from "@/lib/recoveryRollup";
import { OffroadOverview } from "@/components/gm/OffroadOverview";

// Every figure on this page is an age or a countdown measured against now, so
// a cached render would report a stale clock — the one thing a report about
// how long vehicles have been off the road cannot do.
export const dynamic = "force-dynamic";

/**
 * Off-road, for business management.
 *
 * A separate route from `/offroad` rather than another branch inside it. That
 * page is the recovery desk's queue and its permission also gates the case
 * APIs; this one is a report, cannot write anything, and is reached by a role
 * that has no business in the queue.
 *
 * Gated here as well as in the nav: the nav decides what is offered, this
 * decides what is allowed.
 */
export default async function OffroadSummaryPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewOffroadSummary(user.role)) redirect("/dashboard");

  const book = await getManagerBook();
  const territory = summariseByTerritory(
    book.pipelineCaptures,
    [...book.openCases, ...book.closedCases],
    [...book.pendingRequests, ...book.decidedRequests],
    book.aroRoster,
  );

  return (
    <OffroadOverview
      openCases={book.openCases}
      closedCases={book.closedCases}
      territory={territory}
      metrics={book.metrics}
    />
  );
}

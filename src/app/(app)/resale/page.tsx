import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { getResaleDesk } from "@/lib/resaleDesk";
import { ResaleDesk } from "@/components/resale/ResaleDesk";

// The held/on-market split is derived from the clock, so a cached render would
// show a stale division of the marketplace.
export const dynamic = "force-dynamic";

/**
 * The resale desk.
 *
 * The Sr. Executive prices the book, carries it month to month, and closes the
 * sale — so choosing a buyer and re-activating what did not sell both live
 * here. Super Admin sees it as part of general oversight.
 */
const ALLOWED: Role[] = ["SUPER_ADMIN", "SR_EXECUTIVE"];

export default async function ResalePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!ALLOWED.includes(user.role)) redirect("/dashboard");

  const { onMarket, held, commonCycleEnd } = await getResaleDesk();

  return <ResaleDesk onMarket={onMarket} held={held} commonCycleEnd={commonCycleEnd} />;
}

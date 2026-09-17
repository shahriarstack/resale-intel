import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { getRepairBoard } from "@/lib/repairs";
import { RepairBoard } from "@/components/repairs/RepairBoard";

// Elapsed and remaining hours are computed at request time, so this must never
// be cached — a stale render would report a stale clock, which is the one
// thing this page cannot do.
export const dynamic = "force-dynamic";

/**
 * Repair tracking.
 *
 * The Service Manager is the only desk that authorises a repair budget and a
 * deadline, so they are the only desk that needs to watch them run. Super
 * Admin sees it as part of general oversight.
 *
 * Gated here as well as in the nav: the nav decides what is offered, this
 * decides what is allowed.
 */
const ALLOWED: Role[] = ["SUPER_ADMIN", "SERVICE_HEAD"];

export default async function RepairsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!ALLOWED.includes(user.role)) redirect("/dashboard");

  const { repairs, engineers, roster } = await getRepairBoard();

  return <RepairBoard repairs={repairs} engineers={engineers} roster={roster} />;
}

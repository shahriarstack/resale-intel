import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canExport, canTakeResaleMoney } from "@/lib/exports";
import { DataRoom } from "@/components/exports/DataRoom";

export const dynamic = "force-dynamic";

/**
 * The data room.
 *
 * Raw CSV, by category, for the five desks that read the whole book rather than
 * work one file at a time. The role gate is repeated from the nav on purpose —
 * the nav decides what is offered, this decides what is allowed.
 *
 * `canTakeResaleMoney` is resolved here and passed down rather than re-derived
 * in the browser: the client renders the manifest from it, and the server
 * applies it again when it cuts the file. The page does not need to be trusted
 * for the file to be correct.
 */
export default async function ExportsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canExport(user.role)) redirect("/dashboard");

  const territories = await prisma.territory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <DataRoom
      role={user.role}
      territories={territories}
      seesResaleMoney={canTakeResaleMoney(user.role)}
    />
  );
}

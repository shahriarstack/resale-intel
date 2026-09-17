import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { RecordsConsole } from "@/components/admin/RecordsConsole";

export const dynamic = "force-dynamic";

/**
 * Administration → Records.
 *
 * The one screen that can remove a record outright, so the role check is here
 * as well as on every endpoint behind it. The nav already hides it from
 * everybody else; this is what makes the address bar agree.
 */
export default async function AdminRecordsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");

  const territories = await prisma.territory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-7 lg:px-8">
      <header className="mb-6">
        <div className="eyebrow text-accent">Administration</div>
        <h1 className="page-title mt-1 text-[28px]">Records</h1>
        <p className="mt-1.5 max-w-3xl text-[14px] text-ink-2">
          Every vehicle, capture request and off-road case in one list. Correct what was
          mistyped at the roadside; remove what should never have existed. A deletion takes
          the record&rsquo;s photographs, audit trail and offers with it — the console counts
          them before you commit, and what you say about why outlives all of it.
        </p>
      </header>
      <RecordsConsole territories={territories} />
    </div>
  );
}

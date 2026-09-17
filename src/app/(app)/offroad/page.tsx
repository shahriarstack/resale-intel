import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canViewAllOffroad, canViewOffroad } from "@/lib/rbac";
import { getAroBook, getManagerBook } from "@/lib/recoveryDesk";
import { AroOffroad } from "@/components/aro/AroOffroad";
import { OffroadBoards } from "@/components/recovery/OffroadBoards";

export const dynamic = "force-dynamic";

/**
 * The off-road book, at one address for everybody who can read it.
 *
 * Role-aware rather than two routes, because it is the same question asked at
 * two scopes: the officer sees the cases they opened and can close them; the
 * desk sees every officer's and can only supervise. Two routes would have
 * meant two nav entries meaning the same thing, and a manager clicking the
 * officer's one to find it empty.
 */
export default async function OffroadPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewOffroad(user.role)) redirect("/dashboard");

  if (!canViewAllOffroad(user.role)) {
    const book = await getAroBook(user.id);
    return <AroOffroad book={book} />;
  }

  const book = await getManagerBook();
  return <OffroadBoards openCases={book.openCases} closedCases={book.closedCases} />;
}

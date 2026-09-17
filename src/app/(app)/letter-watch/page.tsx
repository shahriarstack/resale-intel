import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canViewAllOffroad } from "@/lib/rbac";
import { getManagerBook } from "@/lib/recoveryDesk";
import { LetterWatch } from "@/components/recovery/LetterWatch";

export const dynamic = "force-dynamic";

export default async function LetterWatchPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canViewAllOffroad(user.role)) redirect("/dashboard");

  const book = await getManagerBook();
  return <LetterWatch rows={book.letterWatch} />;
}

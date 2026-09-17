import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { getAroBook } from "@/lib/recoveryDesk";
import { AroCaptures } from "@/components/aro/AroCaptures";

export const dynamic = "force-dynamic";

export default async function CapturesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "RECOVERY_TEAM" && user.role !== "SUPER_ADMIN") redirect("/dashboard");

  const book = await getAroBook(user.id);
  return <AroCaptures book={book} />;
}

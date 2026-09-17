import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { canOpenOffroadCase } from "@/lib/rbac";
import { OffroadCaseForm } from "@/components/offroad/OffroadCaseForm";

export const dynamic = "force-dynamic";

export default async function ThanaIntakePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenOffroadCase(user.role)) redirect("/dashboard");
  return <OffroadCaseForm kind="THANA" />;
}

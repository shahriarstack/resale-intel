import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { ROLE_META } from "@/lib/rbac";

export default async function Home() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(ROLE_META[user.role].home);
}

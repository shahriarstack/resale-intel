import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

// Every /admin route is Super Admin only.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "SUPER_ADMIN") redirect("/dashboard");
  return <>{children}</>;
}

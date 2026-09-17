import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AppShell } from "@/components/shell/AppShell";
import { getDeskLoad } from "@/lib/deskLoad";
import { isMobileRole } from "@/lib/rbac";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Only the desk shell shows it, so only the desk shell pays for it. A field
  // role never runs this query — and neither does a desk that holds no inbox,
  // which `getDeskLoad` short-circuits without touching the database.
  const deskLoad = isMobileRole(user.role) ? 0 : await getDeskLoad(user.role);

  return (
    <AppShell
      role={user.role}
      name={user.name}
      staffId={user.staffId}
      deskLoad={deskLoad}
    >
      {children}
    </AppShell>
  );
}

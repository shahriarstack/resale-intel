import type { Role } from "@prisma/client";
import { LayoutDashboard, Store, PlusCircle, Users, Database, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Only routes that exist today are listed. As each desk is built (capture,
// overdue tracker, user admin, master data …) its entries are added here, so
// the shell never renders a dead link.
export function getNavItems(role: Role): NavItem[] {
  const dashboard: NavItem = { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard };
  const register: NavItem = { href: "/register", label: "Live Register", icon: Store };

  switch (role) {
    case "RECOVERY_TEAM":
      return [dashboard, { href: "/capture", label: "Capture", icon: PlusCircle }];
    case "SALES_TEAM":
      return [register];
    case "GM_SR_GM":
      return [dashboard, register];
    case "SUPER_ADMIN":
      return [
        dashboard,
        register,
        { href: "/admin/users", label: "Users", icon: Users },
        { href: "/admin/master-data", label: "Master Data", icon: Database },
      ];
    case "AGM_DGM":
    case "SR_EXECUTIVE":
    case "RECOVERY_MANAGER":
    case "SERVICE_HEAD":
      return [dashboard, register];
    default:
      return [dashboard];
  }
}

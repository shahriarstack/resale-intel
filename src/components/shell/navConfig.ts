import type { Role } from "@prisma/client";
import {
  BadgeDollarSign,
  Database,
  Download,
  Eye,
  FileClock,
  FileSearch,
  Gavel,
  LayoutDashboard,
  LayoutList,
  MailWarning,
  Map,
  Store,
  TriangleAlert,
  Truck,
  Unlock,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Which band of the sidebar this belongs to.
   *
   * Three, and they answer three different questions: "what am I doing"
   * (work), "how are we doing" (insight), "who and what is in the system"
   * (setup). A role that only ever sees one band never sees a heading — the
   * grouping is there to break up a long list, not to impose ceremony on a
   * short one.
   */
  group?: NavGroup;
}

export type NavGroup = "work" | "insight" | "setup";

export const GROUP_LABEL: Record<NavGroup, string> = {
  work: "Work",
  insight: "Insight",
  setup: "Setup",
};

export const GROUP_ORDER: NavGroup[] = ["work", "insight", "setup"];

/**
 * The nav split into its bands, in order, with empty bands dropped.
 *
 * Items with no group fall into "work", which is where an unlabelled entry
 * belongs: the thing you came here to do.
 */
export function getNavGroups(role: Role): { group: NavGroup; items: NavItem[] }[] {
  const items = getNavItems(role);
  return GROUP_ORDER.map((group) => ({
    group,
    items: items.filter((i) => (i.group ?? "work") === group),
  })).filter((g) => g.items.length > 0);
}

/**
 * The nav each role sees.
 *
 * Only routes that exist today are listed, so the shell never renders a dead
 * link.
 *
 * The Marketplace is shown to every approving desk, not just the two that
 * transact on it. Each of these roles sets or reviews a number that the
 * marketplace is the outcome of — the Recovery Manager's credit note, the
 * Service Manager's repair budget, the Sr. Executive's SOP, the AGM's price —
 * and none of them could previously see what any of it fetched. Read access
 * to the register is already sealed at the query (see register/page.tsx:
 * bid amounts and bidder counts are management-only, and cost never leaves
 * the server), so widening this changes what these roles can *see*, never
 * what they can do.
 *
 * The three offer-taking roles reach it too, by a different route: sales
 * officers land on it as their home, and AROs and engineers now carry
 * customers of their own, so the marketplace is a place they sell from rather
 * than a report they read. What they see there is the storefront — product,
 * price, their own offers — never the desk chain or the cost basis.
 */
export function getNavItems(role: Role): NavItem[] {
  const dashboard: NavItem = {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    group: "work",
  };
  const register: NavItem = {
    href: "/register",
    label: "Marketplace",
    icon: Store,
    group: "work",
  };
  // Territory coverage — offered to the desks that work geographically. The
  // route enforces the same list; this only decides what is shown.
  const coverage: NavItem = {
    href: "/coverage",
    label: "Territories",
    icon: Map,
    group: "insight",
  };
  // Repair tracking — only the desk that authorises a repair budget and a
  // deadline has any use for watching them run.
  const repairs: NavItem = { href: "/repairs", label: "Repairs", icon: Wrench, group: "insight" };
  // Whole-book summary, territory and engineer. The BM's question spans every
  // desk at once, so they get both readings in one place.
  const summary: NavItem = {
    href: "/summary",
    // Named for what it actually summarises. "Summary" alone sat in an
    // Insights band next to three other summaries and said nothing about
    // which book it was counting.
    label: "Resale Pipeline Summary",
    icon: LayoutList,
    group: "insight",
  };
  // Choosing a buyer and re-activating what did not sell. Only the desk that
  // owns the resale book has any use for it.
  const resale: NavItem = { href: "/resale", label: "Sell & hold", icon: Gavel, group: "work" };
  // Every vehicle that is not earning, whatever put it there. Offered to the
  // two roles that read the off-road book whole; the field officer already has
  // their own slice on the dashboard and does not need a second route to it.
  const offroad: NavItem = {
    href: "/offroad",
    label: "Off-road",
    icon: TriangleAlert,
    group: "work",
  };
  // The Recovery Manager's four jobs, each with its own address.
  //
  // They used to be tabs on one dashboard, which put four different kinds of
  // work behind one URL: nothing was linkable, the browser's back button did
  // nothing useful, and the desk had to remember which tab a thing lived on.
  // A nav entry costs one row in a sidebar and buys all of that back.
  const creditNotes: NavItem = {
    href: "/credit-notes",
    label: "Credit Notes",
    icon: Gavel,
    group: "work",
  };
  const captureRequests: NavItem = {
    href: "/capture-requests",
    label: "Capture requests",
    icon: FileClock,
    group: "work",
  };
  const letterWatch: NavItem = {
    href: "/letter-watch",
    label: "Letter watch",
    icon: MailWarning,
    group: "insight",
  };
  // The officer's own capture screen. Distinct from /capture, which is the
  // form that creates one.
  const captures: NavItem = {
    href: "/captures",
    label: "Captures",
    icon: Truck,
    group: "work",
  };
  // The realised book: what the sold units actually fetched against what they
  // cost. Offered to the three desks that each set one of the numbers the sale
  // is measured against — the final price, the asking price, and the SOP.
  const salesMargin: NavItem = {
    href: "/sales-margin",
    label: "Sales & Margin",
    icon: BadgeDollarSign,
    group: "insight",
  };
  // Business management's read-only view of the same book `offroad` works.
  // Filed under insight rather than work because nothing on it is actionable
  // by the role that can see it — it reports, it does not queue.
  // Raw CSV by category, for the five desks that read the whole book rather
  // than work one file at a time. Filed under insight: taking a file out of the
  // system is a way of reading it, not an administrative act on it.
  const dataRoom: NavItem = {
    href: "/exports",
    label: "Data room",
    icon: Download,
    group: "insight",
  };
  const offroadSummary: NavItem = {
    href: "/offroad-summary",
    label: "Off-road fleet",
    icon: TriangleAlert,
    group: "insight",
  };

  switch (role) {
    // Four items, which is the bottom bar's whole budget (five is the cap and
    // the fifth would be an "Add" that both the dashboard's quick actions and
    // the floating button already cover twice over). These are the officer's
    // top-level screens; everything inside them filters, it does not navigate.
    case "RECOVERY_TEAM":
      return [dashboard, captures, offroad, register];
    case "SALES_TEAM":
      return [register];
    case "SUPER_ADMIN":
      return [
        dashboard,
        register,
        coverage,
        repairs,
        summary,
        salesMargin,
        resale,
        offroad,
        offroadSummary,
        captureRequests,
        letterWatch,
        dataRoom,
        { href: "/admin/users", label: "Users", icon: Users, group: "setup" },
        { href: "/admin/master-data", label: "Master Data", icon: Database, group: "setup" },
        // Filed under setup rather than work: opening one is an administrative
        // act about how the system behaves, not a file to be worked.
        {
          href: "/admin/capture-windows",
          label: "Capture windows",
          icon: Unlock,
          group: "setup",
        },
        // Filed with the other two administrative acts rather than under
        // insight: composing a portal is a decision about who may read the
        // system, not a reading of it.
        { href: "/admin/portals", label: "Portals", icon: Eye, group: "setup" },
        // Last in the group, and deliberately so: it is the only entry here
        // that can remove a record rather than configure one, and a list is
        // read top to bottom.
        {
          href: "/admin/records",
          label: "Records",
          icon: FileSearch,
          group: "setup",
        },
      ];
    case "SR_EXECUTIVE":
      return [dashboard, resale, register, salesMargin, coverage, dataRoom];
    case "RECOVERY_MANAGER":
      return [
        dashboard,
        captureRequests,
        creditNotes,
        offroad,
        letterWatch,
        register,
        coverage,
        dataRoom,
      ];
    case "AGM_DGM":
      return [dashboard, register, salesMargin, coverage, dataRoom];
    case "SERVICE_HEAD":
      return [dashboard, repairs, register];
    case "GM_SR_GM":
      return [dashboard, summary, salesMargin, offroadSummary, register, dataRoom];
    case "SERVICE_ENGINEER":
      return [dashboard, register];
    // One entry, and it is their whole application. A portal viewer has no
    // dashboard to return to and no second screen to reach — everything they
    // may read is composed onto /portal by the grant attached to their
    // account, so a nav of one is the honest shape rather than a stub.
    case "PORTAL_VIEWER":
      return [{ href: "/portal", label: "Portal", icon: Eye, group: "work" }];
    default:
      return [dashboard];
  }
}

/**
 * Where you are, for the desk shell's top bar.
 *
 * The nav answers this for most routes, but not all of them — a vehicle file,
 * the capture form and the intake chooser are reached from inside a screen and
 * were never nav entries. Those are named here, so the bar can always say
 * something rather than going blank on exactly the pages you get to by
 * following a link.
 *
 * It matters more than it looks. Auto-hide is the DEFAULT sidebar mode, which
 * means the panel is a 64px rail of unlabelled glyphs until you reach for it —
 * so for most of the time, on most screens, this bar is the only thing on the
 * page that says which one you are on.
 */
const OFF_NAV_TITLES: { prefix: string; label: string; icon: LucideIcon }[] = [
  { prefix: "/vehicles/", label: "Vehicle file", icon: Truck },
  { prefix: "/capture", label: "New capture", icon: Truck },
  { prefix: "/intake", label: "Add a vehicle", icon: Truck },
  { prefix: "/admin", label: "Administration", icon: Database },
];

export function pageTitle(
  pathname: string,
  role: Role,
): { label: string; icon: LucideIcon } {
  // Longest match wins, so /admin/portals beats a bare /admin and /capture
  // does not claim /capture-requests.
  const nav = getNavItems(role)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (nav) return { label: nav.label, icon: nav.icon };

  const off = OFF_NAV_TITLES.filter((o) => pathname.startsWith(o.prefix)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  if (off) return { label: off.label, icon: off.icon };

  return { label: "Resale Intel", icon: LayoutDashboard };
}

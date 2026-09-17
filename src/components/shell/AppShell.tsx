"use client";

import { Fragment, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { getNavItems, getNavGroups, GROUP_LABEL } from "./navConfig";
import { ROLE_META, isMobileRole, canOpenOffroadCase } from "@/lib/rbac";
import { usePersistedEnum } from "@/lib/usePersisted";
import { noteNavigation } from "@/components/ui/BackLink";
import { CommandPalette, openCommandPalette } from "@/components/workspace/CommandPalette";
import {
  ProductMark,
  ResaleBadge,
  AciMotorsMark,
} from "@/components/brand/BrandMark";
import { AppFooter } from "@/components/shell/AppFooter";
import { DeskTopBar } from "@/components/shell/DeskTopBar";
import { NavPending } from "@/components/shell/NavPending";

/**
 * The application shell.
 *
 * Two shells, chosen by role rather than by viewport: the field roles get a
 * top bar and a bottom tab strip because they are holding a phone, and the
 * desk roles get the side panel because they are not. `isMobileRole` is the
 * one place that decision is made.
 */

/**
 * How the side panel sits.
 *
 *   wide — pinned open. Reading the app.
 *   rail — pinned to icons. Working inside one page all day, nav still there.
 *   auto — hidden to a 64px rail that opens OVER the page on hover, and shuts
 *          when the pointer leaves. Nothing reflows, so the thing you were
 *          reading does not jump sideways every time you glance at the nav.
 *
 * The open/shut behaviour of `auto` is entirely CSS (`:hover`,
 * `:focus-within`). No pointer listeners, no timers, no state that can get
 * stuck open — and tabbing into the nav opens it exactly as a mouse does.
 */
type SidebarMode = "wide" | "rail" | "auto";
/** Module-level so the persistence hook sees a stable reference. */
const SIDEBAR_MODES = ["wide", "rail", "auto"] as const;

const NEXT_MODE: Record<SidebarMode, SidebarMode> = {
  wide: "rail",
  rail: "auto",
  auto: "wide",
};

const MODE_META: Record<SidebarMode, { icon: LucideIcon; hint: string }> = {
  wide: { icon: PanelLeftClose, hint: "Collapse to icons" },
  rail: { icon: PanelLeft, hint: "Auto-hide — opens on hover" },
  auto: { icon: Sparkles, hint: "Auto-hide on · pin it open" },
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function AppShell({
  role,
  name,
  staffId,
  deskLoad = 0,
  children,
}: {
  role: Role;
  name: string;
  staffId: string;
  /** Files waiting on this desk. Resolved on the server; see lib/deskLoad.ts. */
  deskLoad?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const mobile = isMobileRole(role);
  const meta = ROLE_META[role];

  // Count how deep into the app this tab has gone, so a Back control knows
  // whether there is an app page underneath it or whether pressing back would
  // walk out of the product — or, on a home-screen install, close it. See
  // components/ui/BackLink.
  useEffect(() => {
    noteNavigation(pathname);
  }, [pathname]);

  // Read through the external-store hook rather than an effect: the old
  // version rendered once expanded and then again collapsed, which showed a
  // 264px sidebar snapping shut on every load for anyone who had collapsed it.
  // Auto-hide is the default: the panel is a 64px rail until you reach for
  // it, so a first-time desk user gets the whole width for the work rather
  // than 264px of navigation they are not currently using. Anyone who prefers
  // it pinned changes it once and the choice sticks.
  const [mode, setMode] = usePersistedEnum<SidebarMode>("ri:sidebar", SIDEBAR_MODES, "auto");

  const cycle = useCallback(() => setMode(NEXT_MODE[mode]), [mode, setMode]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[" && (e.ctrlKey || e.metaKey) && !mobile) {
        e.preventDefault();
        cycle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [cycle, mobile]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  // ---- Field shell -------------------------------------------------------
  if (mobile) {
    const items = getNavItems(role);
    return (
      // `shell-mobile` publishes the height of the bar below as --shell-top,
      // so a page with its own sticky element (the marketplace's filter rail)
      // can pin itself under this header instead of behind it.
      //
      // `dvh`, not `vh`. On a phone `100vh` counts the browser chrome in, so
      // the page is always taller than what is visible: the bottom of every
      // screen sits under the URL bar until you scroll, and the layout jumps
      // when that bar collapses. `dvh` tracks the real viewport, which is most
      // of the difference between a page in a browser and an app.
      <div className="shell-mobile flex min-h-dvh flex-col">
        {/* Compact by design. This bar is pinned over every screen on a phone,
            so its height is taken from the work rather than added to the page
            — and the field roles read this one-handed in a yard, where a
            shorter bar means more of the list is above the thumb.

            The sign-out control keeps its padding while everything around it
            shrinks: it is the only tap target up here, and a 12px band is
            already the smallest it should be. */}
        <header className="shell-bar glass-nav glass-edge sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-rule px-4 py-2">
          {/* Brand top-left. The tile here used to be the viewer's initials,
              which duplicated the sign-out button on the right — so the left
              is now brand and the right is identity. */}
          <ProductMark role={meta.label} dense />
          <div className="flex shrink-0 items-center gap-2.5">
            {/* The parent mark, in the corner a maker's plate goes. Measured
                at 375px: the brand ends at ~112px and the sign-out starts at
                ~256px, so a 49px mark sits in the gap with room to spare. */}
            <AciMotorsMark height={13} />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Sign out"
              className="flex shrink-0 items-center gap-2 rounded-full border border-rule bg-surface px-3 py-2 text-ink-2 transition-colors active:scale-95 hover:bg-surface-2"
              style={{ boxShadow: "var(--shadow-xs)" }}
            >
              <span className="font-mono text-[10.5px] font-bold text-ink">{initials(name)}</span>
              <LogOut size={14} />
            </button>
          </div>
        </header>

        <main className="shell-tabs-pad flex flex-1 flex-col">
          {children}
          <AppFooter />
        </main>

        <CommandPalette role={role} />

        {/* ---- The dock ----
            Floating rather than edge-to-edge, on the same glass as the header.

            The centre action only exists for the roles that can actually open
            an intake — it goes to `/intake`, the chooser, rather than opening
            a sheet of its own. That chooser is the one place the "a capture is
            not something you start" rule is stated, and a second menu listing
            the same options would be a second place for that rule to drift
            out of agreement with the first.

            Split evenly around the centre so the raised disc sits on the
            dock's midline whatever the item count. */}
        {(() => {
          const canAdd = canOpenOffroadCase(role);
          const mid = Math.ceil(items.length / 2);
          const groups = canAdd ? [items.slice(0, mid), items.slice(mid)] : [items];

          return (
            <nav className="dock" aria-label="Main navigation">
              {groups.map((group, gi) => (
                <Fragment key={gi}>
                  {gi === 1 && (
                    <Link href="/intake" aria-label="Add a vehicle" className="dock-add">
                      <Plus size={21} strokeWidth={2.2} />
                    </Link>
                  )}
                  {group.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        data-active={active}
                        aria-current={active ? "page" : undefined}
                        className="dock-item"
                      >
                        {/* Apple-ish weights: a hairline when resting, a shade
                            heavier when selected. Colour alone is not enough
                            in sunlight, so the stroke carries it too. */}
                        <item.icon size={19} strokeWidth={active ? 2.1 : 1.6} />
                        <span className="dock-label">{item.label}</span>
                        <NavPending />
                      </Link>
                    );
                  })}
                </Fragment>
              ))}
            </nav>
          );
        })()}
      </div>
    );
  }

  // ---- Desk shell --------------------------------------------------------
  const groups = getNavGroups(role);
  const ModeIcon = MODE_META[mode].icon;

  return (
    <div className="shell-desk flex min-h-screen" data-auto={mode === "auto"}>
      <aside
        className="side glass-nav"
        data-mode={mode}
        aria-label="Main navigation"
      >
        <span className="side-glow" aria-hidden="true" />

        <div className="side-head">
          {/* Both marks are rendered and CSS chooses between them. A JS branch
              on the mode cannot answer this, because in auto-hide the real
              input is `:hover` — which React never sees. */}
          <div className="side-label min-w-0 flex-1">
            <ProductMark role={meta.label} />
          </div>
          <span className="side-badge">
            <ResaleBadge size={28} />
          </span>
          <button
            onClick={cycle}
            className="side-mode"
            aria-label={MODE_META[mode].hint}
            title={`${MODE_META[mode].hint} (Ctrl+[)`}
          >
            <ModeIcon size={17} />
          </button>
        </div>

        <nav className="side-nav">
          {groups.map(({ group, items }) => (
            <div key={group} className="side-group">
              {/* One band means no heading to write — the panel is short
                  enough to read whole, and a lone "Work" label above three
                  links is filing for its own sake. */}
              {groups.length > 1 && (
                <span className="side-group-label">{GROUP_LABEL[group]}</span>
              )}
              {items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="side-item"
                    data-active={active}
                    aria-current={active ? "page" : undefined}
                    // Carries the label while the panel is shut. See the
                    // "Rail labels" note in globals.css for why this is the
                    // native tooltip rather than one of our own.
                    title={item.label}
                  >
                    <span className="side-glyph">
                      <item.icon size={17} strokeWidth={active ? 2.3 : 1.9} />
                    </span>
                    <span className="side-label truncate">{item.label}</span>
                    <NavPending />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="side-foot">
          <div className="side-user">
            <span
              className="avatar avatar-sm shrink-0"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              title={`${name} · ${staffId}`}
            >
              {initials(name)}
            </span>
            <span className="side-label min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                {name}
              </span>
              <span className="block truncate font-mono text-[10px] text-ink-3">{staffId}</span>
            </span>
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="side-signout side-open-only"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>

          {/* While the panel is shut the account tile is only an avatar, so
              sign-out needs its own row rather than a control tucked inside
              one. Same reason as the head: CSS decides, not the mode flag. */}
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="side-signout side-shut-only mx-auto mt-1.5"
            aria-label="Sign out"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>

          <button className="side-hint" onClick={openCommandPalette}>
            <span>Search anything</span>
            <span className="kbd">Ctrl K</span>
          </button>
        </div>
      </aside>

      {/* A column, so the footer can take the slack with `mt-auto`. Without
          it a short page leaves the footer floating mid-screen with empty
          ground beneath it. */}
      <main className="flex min-w-0 flex-1 flex-col">
        {/* The ACI mark used to float here on its own, in the flow, so it could
            never land on a page's own top-right control. It now sits inside
            the bar, which solves the same problem more usefully: the row it
            always occupied now also says where you are and what is waiting. */}
        <DeskTopBar role={role} deskLoad={deskLoad} />
        {children}
        <AppFooter />
      </main>

      <CommandPalette role={role} />
    </div>
  );
}

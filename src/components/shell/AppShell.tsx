"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut, PanelLeftClose, PanelLeft } from "lucide-react";
import type { Role } from "@prisma/client";
import { getNavItems } from "./navConfig";
import { ROLE_META, isMobileRole } from "@/lib/rbac";
import { usePersistedEnum } from "@/lib/usePersisted";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ProductMark } from "@/components/brand/BrandMark";

type SidebarState = "open" | "collapsed";
/** Module-level so the persistence hook sees a stable reference. */
const SIDEBAR_STATES = ["open", "collapsed"] as const;

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
  children,
}: {
  role: Role;
  name: string;
  staffId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = getNavItems(role);
  const mobile = isMobileRole(role);
  const meta = ROLE_META[role];
  // Read through the external-store hook rather than an effect: the old
  // version rendered once expanded and then again collapsed, which showed a
  // 264px sidebar snapping shut on every load for anyone who had collapsed it.
  const [sidebar, setSidebar] = usePersistedEnum<SidebarState>(
    "ri:sidebar",
    SIDEBAR_STATES,
    "open",
  );
  const collapsed = sidebar === "collapsed";

  const toggle = useCallback(
    () => setSidebar(collapsed ? "open" : "collapsed"),
    [collapsed, setSidebar],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "[" && (e.ctrlKey || e.metaKey) && !mobile) {
        e.preventDefault();
        toggle();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [toggle, mobile]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/");

  if (mobile) {
    return (
      <div className="min-h-screen">
        <header className="glass-nav glass-edge sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
          {/* Brand top-left. The tile here used to be the viewer's initials,
              which duplicated the sign-out button on the right — so the left
              is now brand and the right is identity. */}
          <ProductMark role={meta.label} />
          <div className="flex shrink-0 items-center gap-1.5">
            <ThemeToggle compact />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              aria-label="Sign out"
              className="flex shrink-0 items-center gap-2 rounded-full border border-rule bg-surface px-3 py-2 text-ink-2 transition-colors active:scale-95 hover:bg-surface-2"
              style={{ boxShadow: "var(--shadow-xs)" }}
            >
              <span className="font-mono text-[11px] font-bold text-ink">{initials(name)}</span>
              <LogOut size={15} />
            </button>
          </div>
        </header>

        <main className="pb-24">{children}</main>

        <CommandPalette role={role} />

        <nav className="glass-nav glass-edge fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t border-rule pb-safe">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors"
                style={active ? { color: "var(--accent)" } : { color: "var(--ink-3)" }}
              >
                <div className="relative">
                  <item.icon size={21} strokeWidth={active ? 2.4 : 1.8} />
                  {active && (
                    <span
                      className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </div>
                <span className="text-[10px] font-semibold tracking-wide">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  const sideW = collapsed ? 72 : 264;

  return (
    <div className="flex min-h-screen">
      <aside
        className="glass-nav sticky top-0 z-40 flex h-screen shrink-0 flex-col border-r border-rule transition-[width] duration-200"
        style={{ width: sideW }}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-5" style={{ minHeight: 72 }}>
          {collapsed ? (
            <ProductMark compact />
          ) : (
            <div className="min-w-0" style={{ animation: "fadeIn 0.15s ease" }}>
              <ProductMark role={meta.label} />
            </div>
          )}
          <button
            onClick={toggle}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand (Ctrl+[)" : "Collapse (Ctrl+[)"}
          >
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {items.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-[background-color,color] duration-150"
                style={
                  active
                    ? { background: "var(--accent-soft)", color: "var(--accent-ink)" }
                    : { color: "var(--ink-2)" }
                }
                title={collapsed ? item.label : undefined}
              >
                <div className="relative shrink-0">
                  <item.icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                  {active && (
                    <span
                      className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: "var(--accent)" }}
                    />
                  )}
                </div>
                {!collapsed && (
                  <span className="truncate" style={{ animation: "fadeIn 0.15s ease" }}>
                    {item.label}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-rule p-3">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="avatar avatar-sm"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                title={`${name} · ${staffId}`}
              >
                {initials(name)}
              </div>
              <ThemeToggle compact />
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad"
                aria-label="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-3 px-1">
                <div
                  className="avatar avatar-sm shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {initials(name)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{name}</div>
                  <div className="font-mono text-[11px] text-ink-3">{staffId}</div>
                </div>
              </div>
              <div className="mb-2">
                <ThemeToggle />
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="btn btn-ghost btn-block btn-sm justify-start text-bad"
              >
                <LogOut size={16} /> Sign out
              </button>
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>

      <CommandPalette role={role} />
    </div>
  );
}

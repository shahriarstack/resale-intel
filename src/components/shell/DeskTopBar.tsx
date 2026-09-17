"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, Search } from "lucide-react";
import type { Role } from "@prisma/client";
import { pageTitle } from "./navConfig";
import { openCommandPalette } from "@/components/workspace/CommandPalette";
import { AciCorner } from "@/components/brand/BrandMark";

/**
 * The desk shell's top bar.
 *
 * The desk surface had none, and the space was not empty — it held a floating
 * ACI mark with nothing else to justify the row it sat in. So this bar does not
 * add chrome; it gives that mark a home and earns the row with three things the
 * side panel is bad at.
 *
 *   WHERE YOU ARE   Auto-hide is the DEFAULT sidebar mode, so for most of the
 *                   time the panel is a 64px rail of unlabelled glyphs. Without
 *                   this, nothing on screen names the page you are on — and
 *                   `pageTitle` answers for the routes the nav never listed
 *                   either, like a vehicle file.
 *
 *   SEARCH          Ctrl+K already opened the palette, and the only visible
 *                   affordance for it was at the bottom of a panel that is shut
 *                   by default. A shortcut nobody can see is a shortcut only
 *                   the person who built it uses.
 *
 *   WHAT IS WAITING One number: how many files are on this desk. It is counted
 *                   from the transition table (see lib/deskLoad.ts), so it is
 *                   the same "yours" the queue uses and the two cannot drift.
 *
 * What it deliberately does NOT carry is identity. The account tile and
 * sign-out live in the side panel's foot, one hover away, and a second copy up
 * here would be the same control in two places — which is the thing the mobile
 * bar was reorganised to stop doing.
 *
 * No scroll state, no listeners, no timers. It is a sticky element with a
 * hairline, in the same spirit as the auto-hide panel being pure CSS: nothing
 * here can get stuck in the wrong state because there is no state.
 */
export function DeskTopBar({ role, deskLoad }: { role: Role; deskLoad: number }) {
  const pathname = usePathname();
  const here = pageTitle(pathname, role);
  const Icon = here.icon;

  // Rendered on the server and the client from the same instant would be ideal;
  // it is not worth a hydration risk for a date, so it is formatted from the
  // client's own clock, which is also the one the reader is living in.
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return (
    <header className="topbar">
      <span className="topbar-here">
        <span className="topbar-glyph">
          <Icon size={14} strokeWidth={2.1} />
        </span>
        <span className="topbar-title">{here.label}</span>
      </span>

      <button className="topbar-search" onClick={openCommandPalette}>
        <Search size={13} />
        <span className="topbar-search-text">Search anything</span>
        <span className="kbd">Ctrl K</span>
      </button>

      <span className="topbar-right">
        {deskLoad > 0 && (
          <Link
            href="/dashboard"
            className="topbar-load"
            title={`${deskLoad} file${deskLoad === 1 ? "" : "s"} waiting on your desk`}
          >
            <Inbox size={13} />
            <span className="topbar-load-n">{deskLoad}</span>
            <span className="topbar-load-label">on your desk</span>
          </Link>
        )}
        <span className="topbar-date">{today}</span>
        <AciCorner />
      </span>
    </header>
  );
}

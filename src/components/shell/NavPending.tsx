"use client";

import { useLinkStatus } from "next/link";

/**
 * The pending hint on a nav item.
 *
 * `useLinkStatus` only reports for the `<Link>` it is rendered inside, which
 * is exactly the granularity wanted here: the item you clicked shows it
 * working, the others stay still.
 *
 * The bar starts invisible behind a 120ms delay (see `.nav-pending`), so a
 * navigation that resolves quickly — most of them, since routes are
 * prefetched — never flashes anything. Only a wait worth acknowledging gets
 * acknowledged, which is the difference between feedback and flicker.
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <span className="nav-pending" aria-hidden="true" />;
}

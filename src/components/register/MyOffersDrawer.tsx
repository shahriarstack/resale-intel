"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Building2, Pencil, Trophy, Truck, X } from "lucide-react";
import { taka, timeAgo } from "@/lib/format";
import { offerFor } from "@/lib/bids";
import type { Listing } from "@/components/register/Storefront";

/**
 * Everything this officer has out, in one place.
 *
 * An officer working a customer list loses track of what they have quoted
 * where — three buyers across two trucks, one of them re-quoted last week. The
 * register answers "what is for sale"; this answers "what have I said", which
 * is the question they actually arrive with on the second visit.
 *
 * Grouped by vehicle rather than sorted by date, because that is how the
 * follow-up conversation goes: the truck first, then who is on it.
 */

export function MyOffersDrawer({
  listings,
  onClose,
  onOpenVehicle,
}: {
  listings: Listing[];
  onClose: () => void;
  onOpenVehicle: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const withMine = useMemo(
    () => listings.filter((v) => v.myOffers.length > 0),
    [listings],
  );

  const totalOffers = withMine.reduce((n, v) => n + v.myOffers.length, 0);
  const won = withMine.filter((v) => v.sold && v.iBroughtIt).length;

  return createPortal(
    <>
      <div
        className="backdrop"
        style={{ zIndex: 89 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="sf-drawer" role="dialog" aria-modal="true" aria-label="Your customer offers">
        <span className="sf-grip" />
        <header className="flex items-start justify-between gap-3 border-b border-rule px-5 pb-4 pt-3.5">
          <div>
            <h2 className="font-display text-xl font-bold text-ink">Your offers</h2>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
              {totalOffers} customer{totalOffers === 1 ? "" : "s"} across {withMine.length}{" "}
              vehicle{withMine.length === 1 ? "" : "s"}
              {won > 0 && ` · ${won} won`}
            </p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </header>

        <div className="sf-sheet-body px-5 py-4">
          {withMine.length === 0 ? (
            <div className="grid place-items-center gap-3 py-16 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-surface-2">
                <Building2 size={24} className="text-ink-3" strokeWidth={1.5} />
              </div>
              <p className="text-[13px] text-ink-2">
                You have not put a customer forward yet. Open any vehicle and submit their price.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {withMine.map((v) => (
                <li key={v.id}>
                  <button
                    className="flex w-full items-center gap-2.5 text-left"
                    onClick={() => onOpenVehicle(v.id)}
                  >
                    <span className="h-11 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      {v.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={v.images[0]}
                          alt=""
                          width={112}
                          height={88}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center">
                          <Truck size={15} className="text-ink-3" />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-bold text-ink">
                        {v.title}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-ink-3">
                        {v.registrationNo} · asking {taka(v.price)}
                      </span>
                    </span>
                    {v.sold ? (
                      <span
                        className="chip shrink-0"
                        style={
                          v.iBroughtIt
                            ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
                            : { background: "var(--surface-3)", color: "var(--ink-3)" }
                        }
                      >
                        {v.iBroughtIt ? (
                          <>
                            <Trophy size={10} /> Won
                          </>
                        ) : (
                          "Sold"
                        )}
                      </span>
                    ) : (
                      <Pencil size={13} className="shrink-0 text-ink-3" />
                    )}
                  </button>

                  <ul className="mt-1.5 flex flex-col gap-1.5 border-l-2 border-rule pl-3">
                    {v.myOffers.map((o) => (
                      <li key={o.id} className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-[12px] font-semibold text-ink">
                            {offerFor(o)}
                          </div>
                          <div
                            className="font-mono text-[9px] text-ink-3"
                            suppressHydrationWarning
                          >
                            {o.revisedAt ? `revised ${timeAgo(o.revisedAt)}` : timeAgo(o.createdAt)}
                          </div>
                        </div>
                        <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-ink">
                          {taka(o.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

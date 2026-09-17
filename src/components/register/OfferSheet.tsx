"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Building2,
  Check,
  PenLine,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka, timeAgo } from "@/lib/format";
import { liveOffers, offerFor, type OfferRow } from "@/lib/bids";
import { useIsClient } from "@/lib/useIsClient";
import { NumberField } from "@/components/ui/NumberField";
import { useToast } from "@/components/ui/Toast";

/**
 * Submitting a customer's price.
 *
 * The officer is not bidding — they are relaying what a named buyer said they
 * would pay. Everything here follows from that:
 *
 *  - the customer's name is the first field and is required, because an offer
 *    with nobody behind it is not something a desk can act on;
 *  - several offers on one vehicle from one officer is the normal case, not an
 *    error to guard against, so the sheet lists what is already in and invites
 *    another rather than replacing anything;
 *  - an offer can be corrected in place or taken off the table, because buyers
 *    change their minds and a typo should not need a second row to fix.
 *
 * The asking price is shown as a reference and nothing more. Under-asking
 * offers are submitted, flagged, and left for the desk to weigh — the officer
 * is told they are low, not stopped.
 */

import type { SalesOfficer } from "@/components/register/Storefront";

/** Two letters for the officer chips. Same rule the app shell uses. */
function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export interface OfferTarget {
  id: string;
  title: string;
  make: string | null;
  registrationNo: string;
  image: string | null;
  price: number | null;
  myOffers: OfferRow[];
}

type Draft = {
  id: string | null;
  officerId: string;
  customer: string;
  amount: string;
  note: string;
};

export function OfferSheet({
  target,
  salesOfficers,
  viewerId,
  onClose,
}: {
  target: OfferTarget;
  /** Active sales officers, for crediting the offer. Empty for ARO/engineer. */
  salesOfficers: SalesOfficer[];
  viewerId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isClient = useIsClient();
  // Whose customer is this? The sales team shares one marketplace, so the
  // question has to be asked out loud. It defaults to the person signed in
  // when they are on the roster themselves, which makes the common case a
  // no-op and the "entering it for a colleague" case one tap.
  const iAmOnRoster = salesOfficers.some((o) => o.id === viewerId);
  const emptyDraft = useMemo<Draft>(
    () => ({
      id: null,
      officerId: iAmOnRoster ? viewerId : "",
      customer: "",
      amount: "",
      note: "",
    }),
    [iAmOnRoster, viewerId],
  );

  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  // Rows submitted in this sitting, so the list answers immediately instead of
  // waiting on the server round trip that refreshes the page behind the sheet.
  const [addedIds, setAddedIds] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  const mine = useMemo(() => liveOffers(target.myOffers), [target.myOffers]);
  const editing = draft.id !== null;

  const amount = Number(draft.amount);
  const amountOk = draft.amount.trim() !== "" && Number.isFinite(amount) && amount > 0;
  const customerOk = draft.customer.trim().length >= 2;
  // An ARO or an engineer brings their own customer and is credited
  // themselves, so they never see the picker and never have to satisfy it.
  const needsOfficer = salesOfficers.length > 0;
  const officerOk = !needsOfficer || draft.officerId !== "";
  const valid = amountOk && customerOk && officerOk;
  const chosenOfficer = salesOfficers.find((o) => o.id === draft.officerId) ?? null;
  const gap = amountOk && target.price !== null ? amount - target.price : null;

  // Quick-set chips. Offered as a *starting point* for typing, not a shortcut
  // that submits: a real customer figure is rarely a round percentage.
  const suggestions = useMemo(() => {
    if (!target.price) return [];
    return [
      { label: "Asking", value: target.price },
      { label: "−2%", value: Math.round(target.price * 0.98) },
      { label: "−5%", value: Math.round(target.price * 0.95) },
      { label: "+3%", value: Math.round(target.price * 1.03) },
    ];
  }, [target.price]);

  const reset = () => {
    setDraft(emptyDraft);
    setError("");
  };

  const submit = async () => {
    if (!valid) {
      setError(
        !officerOk
          ? "Choose which sales officer this customer belongs to."
          : !customerOk
            ? "Enter the customer's name."
            : "Enter an offer amount above zero.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (editing) {
        await sendJSON(`/api/vehicles/${target.id}/bids/${draft.id}`, "PATCH", {
          salesOfficerId: draft.officerId,
          customerName: draft.customer.trim(),
          amount,
          note: draft.note.trim(),
        });
        toast(`Offer for ${draft.customer.trim()} updated`, "ok");
      } else {
        const res = await sendJSON<{ offer: OfferRow }>(
          `/api/vehicles/${target.id}/bids`,
          "POST",
          {
            salesOfficerId: draft.officerId,
            customerName: draft.customer.trim(),
            amount,
            note: draft.note.trim(),
          },
        );
        setAddedIds((ids) => [...ids, res.offer.id]);
        toast(`${taka(amount)} submitted for ${draft.customer.trim()}`, "ok");
      }
      reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save that offer");
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (o: OfferRow) => {
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${target.id}/bids/${o.id}`, "DELETE");
      toast(`Offer for ${offerFor(o)} withdrawn`);
      setRemoving(null);
      if (draft.id === o.id) reset();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not withdraw that offer");
    } finally {
      setBusy(false);
    }
  };

  if (!isClient) return null;

  return createPortal(
    <div
      className="backdrop backdrop-sheet"
      onClick={() => !busy && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`Customer offers on ${target.title}`}
    >
      <div
        className="sf-sheet"
        style={{ "--sheet-w": "520px" } as React.CSSProperties}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="sf-grip" />
        {/* ---- Product header --------------------------------------------- */}
        <div className="flex items-start gap-3 border-b border-rule px-5 py-4">
          <div className="h-14 w-[74px] shrink-0 overflow-hidden rounded-lg bg-surface-2">
            {target.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={target.image}
                alt=""
                width={148}
                height={112}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center">
                <Truck size={18} className="text-ink-3" strokeWidth={1.5} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-display text-lg font-bold leading-tight text-ink">
              {target.title}
            </h3>
            <p className="mt-0.5 font-mono text-[10.5px] text-ink-3">
              {target.registrationNo}
              {target.make && ` · ${target.make}`}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Tag size={11} className="text-accent" />
              <span className="font-mono text-[11.5px] font-bold tabular-nums text-ink">
                {taka(target.price)}
              </span>
              <span className="text-[10.5px] text-ink-3">asking</span>
            </div>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="sf-sheet-body px-5 py-4">
          {/* ---- What this officer already has in ------------------------- */}
          {mine.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 flex items-baseline justify-between">
                <span className="label">Your offers on this vehicle</span>
                <span className="font-mono text-[10px] text-ink-3">
                  {mine.length} customer{mine.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {mine.map((o) => {
                  const delta = target.price === null ? null : o.amount - target.price;
                  const isNew = addedIds.includes(o.id);
                  return (
                    <li key={o.id}>
                      <div
                        className="sf-offer"
                        data-picked={draft.id === o.id}
                        style={
                          isNew ? { animation: "scaleIn 0.3s var(--ease-spring)" } : undefined
                        }
                      >
                        <span className="mt-0.5 shrink-0 text-ink-3">
                          <Building2 size={13} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-semibold text-ink">
                            {offerFor(o)}
                          </div>
                          <div
                            className="mt-0.5 font-mono text-[9.5px] text-ink-3"
                            suppressHydrationWarning
                          >
                            {o.revisedAt ? `revised ${timeAgo(o.revisedAt)}` : timeAgo(o.createdAt)}
                          </div>
                          {o.note && (
                            <p className="mt-1 text-[11px] italic text-ink-2">{o.note}</p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-mono text-[13px] font-bold tabular-nums text-ink">
                            {taka(o.amount)}
                          </div>
                          {delta !== null && delta !== 0 && (
                            <div
                              className="font-mono text-[9px]"
                              style={{ color: delta > 0 ? "var(--ok)" : "var(--warn)" }}
                            >
                              {delta > 0 ? "+" : "−"}
                              {taka(Math.abs(delta))}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-1">
                          <button
                            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
                            onClick={() => {
                              setError("");
                              setRemoving(null);
                              setDraft({
                                id: o.id,
                                officerId:
                                  salesOfficers.find((s) => s.staffId === o.officerStaffId)?.id ??
                                  emptyDraft.officerId,
                                customer: o.customerName ?? "",
                                amount: String(o.amount),
                                note: o.note ?? "",
                              });
                            }}
                            disabled={busy}
                            aria-label={`Edit the offer for ${offerFor(o)}`}
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad-ink"
                            onClick={() => setRemoving(removing === o.id ? null : o.id)}
                            disabled={busy}
                            aria-label={`Withdraw the offer for ${offerFor(o)}`}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {removing === o.id && (
                        <div
                          className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                          style={{
                            borderColor: "color-mix(in srgb, var(--bad) 30%, transparent)",
                            background: "var(--bad-soft)",
                          }}
                        >
                          <span className="text-[11.5px] font-medium text-bad">
                            Take this offer off the table?
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setRemoving(null)}
                              disabled={busy}
                            >
                              Keep
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => withdraw(o)}
                              disabled={busy}
                            >
                              {busy ? <Loader2 size={13} className="animate-spin" /> : "Withdraw"}
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* ---- The form ------------------------------------------------- */}
          <div
            className="rounded-[var(--radius)] border border-rule bg-surface-2 p-3.5"
            style={editing ? { borderColor: "var(--accent)" } : undefined}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                {editing ? <Pencil size={13} /> : <Plus size={14} />}
                {editing
                  ? "Edit this offer"
                  : mine.length > 0
                    ? "Add another customer"
                    : "Submit a customer offer"}
              </span>
              {editing && (
                <button className="btn btn-ghost btn-sm" onClick={reset} disabled={busy}>
                  Cancel edit
                </button>
              )}
            </div>

            {/* Whose customer is this?
                A grid of people rather than a <select>: on a shared desk the
                answer is a colleague you recognise by name and patch, and a
                dropdown hides exactly that — you would be picking from a list
                you cannot see. Territory sits under each name because two
                officers with similar names in different patches is the case
                this has to get right. */}
            {needsOfficer && (
              <div className="mb-4">
                <label className="label mb-1.5 block">Sales officer</label>
                <div className="sf-officers">
                  {salesOfficers.map((o) => {
                    const on = draft.officerId === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="sf-officer"
                        data-on={on}
                        onClick={() => setDraft({ ...draft, officerId: o.id })}
                        aria-pressed={on}
                      >
                        <span className="sf-officer-face">{initials(o.name)}</span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-[12.5px] font-semibold">
                            {o.name}
                            {o.id === viewerId && (
                              <span className="ml-1 text-[10px] font-normal opacity-70">you</span>
                            )}
                          </span>
                          <span className="block truncate font-mono text-[9.5px] opacity-70">
                            {o.salesTerritory || "No territory set"}
                          </span>
                        </span>
                        {on && <Check size={14} className="shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                {chosenOfficer && chosenOfficer.id !== viewerId && (
                  <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-ink-3">
                    <PenLine size={11} className="mt-px shrink-0" />
                    Credited to {chosenOfficer.name}. The offer book will also record that you
                    entered it.
                  </p>
                )}
              </div>
            )}

            <label className="label mb-1.5 block" htmlFor="offer-customer">
              Customer name
            </label>
            <input
              id="offer-customer"
              className="field"
              value={draft.customer}
              onChange={(e) => setDraft({ ...draft, customer: e.target.value })}
              placeholder="e.g. Rahim Transport, Dhaka"
              maxLength={160}
              autoFocus
            />

            <label className="label mb-1.5 mt-3.5 block" htmlFor="offer-amount">
              Their price (Tk)
            </label>
            <NumberField
              id="offer-amount"
              className="field font-mono text-lg"
              value={draft.amount}
              onChange={(v) => setDraft({ ...draft, amount: v })}
              placeholder="0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && valid && !busy) submit();
              }}
            />

            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    className="sf-pill"
                    style={{ height: 26, fontSize: 11 }}
                    data-on={amountOk && amount === s.value}
                    onClick={() => setDraft({ ...draft, amount: String(s.value) })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {amountOk && (
              <div
                className="mt-2.5 flex flex-wrap items-center gap-2"
                style={{ animation: "fadeIn 0.15s var(--ease-standard)" }}
              >
                <span className="font-mono text-[13px] font-bold tabular-nums text-ink">
                  {taka(amount)}
                </span>
                {gap !== null && gap !== 0 && (
                  <span
                    className="flex items-center gap-1 font-mono text-[11px]"
                    style={{ color: gap > 0 ? "var(--ok)" : "var(--warn)" }}
                  >
                    {gap > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {taka(Math.abs(gap))} {gap > 0 ? "above" : "below"} asking
                  </span>
                )}
                {gap === 0 && (
                  <span className="font-mono text-[11px] text-ink-3">exactly at asking</span>
                )}
              </div>
            )}

            {gap !== null && gap < 0 && (
              <div
                className="mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px]"
                style={{
                  borderColor: "color-mix(in srgb, var(--warn) 34%, transparent)",
                  background: "var(--warn-soft)",
                  color: "var(--warn)",
                }}
              >
                <AlertCircle size={13} className="mt-px shrink-0" />
                <span>
                  Below the asking price. It will still be recorded — the decision on whether to
                  take it is management&rsquo;s.
                </span>
              </div>
            )}

            <label className="label mb-1.5 mt-3.5 block" htmlFor="offer-note">
              Remarks <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <textarea
              id="offer-note"
              className="field resize-none text-sm"
              rows={2}
              value={draft.note}
              onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              placeholder="Payment terms, how serious the buyer is, delivery expectations…"
              maxLength={500}
            />

            {error && (
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium text-bad"
                style={{
                  borderColor: "color-mix(in srgb, var(--bad) 26%, transparent)",
                  background: "var(--bad-soft)",
                  animation: "scaleIn 0.15s var(--ease-spring)",
                }}
                role="alert"
              >
                <AlertCircle size={14} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            <button
              className="btn btn-primary btn-block mt-3.5"
              onClick={submit}
              disabled={busy || !valid}
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : editing ? (
                <>
                  <Check size={15} /> Save changes
                </>
              ) : (
                <>
                  <Plus size={15} /> Submit offer
                </>
              )}
            </button>
          </div>

          <p className="mt-3 text-center font-mono text-[9.5px] leading-relaxed text-ink-3">
            One vehicle can carry as many customer offers as you have buyers. Other officers
            cannot see yours.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}

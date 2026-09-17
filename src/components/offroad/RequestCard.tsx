"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FileClock,
  HandCoins,
  Loader2,
  Store,
  Truck,
  X,
} from "lucide-react";
import { sendJSON } from "@/lib/http";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { CAPTURE_REQUEST_META } from "@/lib/offroad";
import { taka, shortDate } from "@/lib/format";
import type { RequestRow } from "@/lib/recoveryDesk";

type Decision = "APPROVE" | "DECLINE" | "WITHDRAW";

/**
 * One capture request.
 *
 * The card is the same on both sides of the decision; what changes is the
 * footer. The officer who raised it gets "complete the capture" once it is
 * approved and "withdraw" while it is pending; the manager gets approve and
 * decline. Nobody gets both, and the server enforces that independently.
 */
export function RequestCard({
  request,
  canDecide,
  canWithdraw,
  showOwner = false,
}: {
  request: RequestRow;
  canDecide: boolean;
  canWithdraw: boolean;
  showOwner?: boolean;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [expanded, setExpanded] = useState(false);
  const meta = CAPTURE_REQUEST_META[request.status];
  const pending = request.status === "PENDING";

  // The one thing on this card where elapsed time is somebody's fault, and the
  // one thing an approved request is waiting for. Both surface as a flat strip
  // across the top rather than a coloured left edge.
  const strip: { tone: string; label: string } | null =
    request.status === "APPROVED"
      ? { tone: "var(--ok)", label: "Approved — capture it" }
      : pending && request.ageDays >= 2
        ? { tone: "var(--warn)", label: `Waiting ${request.ageDays} days` }
        : null;

  return (
    <article className="card overflow-hidden">
      {strip && (
        <div
          className="flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide"
          style={{
            background: `color-mix(in srgb, ${strip.tone} 12%, var(--surface))`,
            color: strip.tone,
          }}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: strip.tone }} />
          {strip.label}
        </div>
      )}
      <div className="p-3">
      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
          style={{ background: "var(--surface-3)", color: "var(--ink-2)" }}
        >
          <FileClock size={16} />
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* The account heads it. A capture request is an argument about a
                customer's position — instalments overdue, what they owe —
                and the truck is the collateral being argued over. */}
            <AccountTitle
              record={request}
              className="font-display text-[16px] font-bold leading-tight text-ink"
            />
            <Chip tone={meta.tone}>{meta.label}</Chip>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
            {request.registrationNo} ·{" "}
            {[request.make, request.model].filter(Boolean).join(" ") || "Vehicle"}
          </p>
        </div>

        <span className="shrink-0 text-right font-mono text-[10.5px] leading-tight text-ink-3">
          {pending ? (
            <>
              {request.ageDays === 0 ? "today" : `${request.ageDays}d`}
              <br />
              waiting
            </>
          ) : (
            shortDate(request.decidedAt ?? request.requestedAt)
          )}
        </span>
      </div>

      {/* The account position — the reason the request exists, so it is on the
          face of the card rather than behind the disclosure. */}
      <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-2">
        <Figure label="OD #" value={String(request.odNumber)} />
        <Figure label="OD amount" value={taka(request.odAmount)} />
        <Figure label="Outstanding" value={taka(request.outstandingAmount)} strong />
      </div>

      {/* What the officer expects AFTER the capture — not whether to capture.
          Both readings end with the vehicle being taken; they differ in where
          the file goes next, so the label names the destination. */}
      <div className="mt-2 flex items-center gap-1.5">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold"
          style={
            request.settlementPossible
              ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
              : { background: "var(--warn-soft)", color: "var(--warn-ink)" }
          }
        >
          {request.settlementPossible ? <HandCoins size={11} /> : <Store size={11} />}
          {request.settlementPossible
            ? "Expects settlement — vehicle returns"
            : "Expects customer will not return — resale"}
        </span>
      </div>

      <button
        onClick={() => setExpanded((s) => !s)}
        className="mt-2 flex w-full items-center justify-between rounded-lg px-1 py-1 text-[11.5px] font-semibold text-ink-3 transition-colors hover:bg-surface-2"
        aria-expanded={expanded}
      >
        {expanded ? "Hide detail" : "Detail"}
        <ChevronDown
          size={14}
          className="transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
        />
      </button>

      {expanded && (
        <dl
          className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-3 text-[12px]"
          style={{ animation: "slideDown 0.18s var(--ease-standard)" }}
        >
          <Fact label="Customer ID">{request.customerCode}</Fact>
          <Fact label="Territory">{request.territory?.name ?? "—"}</Fact>
          <Fact label="Raised">{shortDate(request.requestedAt)}</Fact>
          {showOwner && <Fact label="Raised by">{request.requestedBy?.name ?? "—"}</Fact>}
          <Fact label="Remarks" wide>
            {request.remarks}
          </Fact>
          {request.decidedAt && (
            <Fact label={`${meta.label} by`} wide>
              {request.decidedBy?.name ?? "—"} · {shortDate(request.decidedAt)}
            </Fact>
          )}
          {request.decisionNote && (
            <Fact label="Decision note" wide>
              {request.decisionNote}
            </Fact>
          )}
        </dl>
      )}

      {/* ---- Footer: whose move is it ---- */}
      {pending && canDecide && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className="btn btn-danger btn-sm" onClick={() => setDecision("DECLINE")}>
            <X size={14} /> Decline
          </button>
          <button className="btn btn-ok btn-sm" onClick={() => setDecision("APPROVE")}>
            <Check size={14} /> Approve
          </button>
        </div>
      )}

      {pending && !canDecide && canWithdraw && (
        <button
          className="btn btn-ghost btn-sm mt-2 w-full"
          onClick={() => setDecision("WITHDRAW")}
        >
          Withdraw request
        </button>
      )}

      {request.status === "APPROVED" && (
        <Link
          href={`/capture?requestId=${request.id}`}
          className="btn btn-gradient btn-sm mt-2 w-full"
        >
          <Truck size={14} /> Complete capture
          <ArrowRight size={14} />
        </Link>
      )}

      {request.status === "CAPTURED" && request.vehicleId && (
        <Link
          href={`/vehicles/${request.vehicleId}`}
          className="btn btn-ghost btn-sm mt-2 w-full"
        >
          Open the captured file
          <ArrowRight size={14} />
        </Link>
      )}

      {decision && (
        <DecisionModal
          decision={decision}
          request={request}
          onClose={() => setDecision(null)}
        />
      )}
      </div>
    </article>
  );
}

function DecisionModal({
  decision,
  request,
  onClose,
}: {
  decision: Decision;
  request: RequestRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isDecline = decision === "DECLINE";
  const isApprove = decision === "APPROVE";
  const titleId = "request-decision-title";

  const go = async () => {
    if (isDecline && !note.trim()) {
      setError("A reason is required to decline.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/capture-requests/${request.id}`, "PATCH", {
        action: decision,
        note: note.trim(),
      });
      toast(
        isApprove
          ? "Approved — the officer can now capture"
          : isDecline
            ? "Declined"
            : "Request withdrawn",
      );
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      variant="mobile"
      size="md"
      labelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId={titleId}
        title={
          isApprove ? "Approve capture" : isDecline ? "Decline request" : "Withdraw request"
        }
        subtitle={`${request.registrationNo} · ${request.customerName}`}
        icon={isApprove ? <Check size={17} /> : <X size={17} />}
        tone={isApprove ? "accent" : "bad"}
        onClose={busy ? undefined : onClose}
      />
      <ModalBody>
        <div
          className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
          style={
            isApprove
              ? { borderColor: "var(--ok)", background: "var(--ok-soft)", color: "var(--ok-ink)" }
              : {
                  borderColor: "var(--rule-strong)",
                  background: "var(--surface-2)",
                  color: "var(--ink-2)",
                }
          }
        >
          {isApprove
            ? "The officer is cleared to seize this vehicle and will complete the capture form once it is in hand. The account position above is what this approval is recorded against."
            : isDecline
              ? "The request is refused and the officer is told why. They can raise a fresh request if the position changes."
              : "The request is pulled. Nothing is approved and no capture is authorised."}
        </div>

        {isApprove && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs font-medium"
            style={
              request.settlementPossible
                ? { borderColor: "var(--ok)", background: "var(--ok-soft)", color: "var(--ok-ink)" }
                : { borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--warn-ink)" }
            }
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {request.settlementPossible
              ? "The officer expects the capture to force a settlement — plan for the vehicle to go back once the dues clear."
              : "The officer expects the customer will not return — plan for this one to reach a Credit Note and resale."}
          </div>
        )}

        <label className="label mb-1.5 mt-4 block" htmlFor="decision-note">
          {isDecline ? "Reason" : "Note"}
          {isDecline ? (
            <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
              required
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
          )}
        </label>
        <textarea
          id="decision-note"
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={
            isDecline
              ? "Why is this refused? What should the officer do instead?"
              : "Any condition or instruction for the officer…"
          }
          autoFocus
          maxLength={1000}
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-xs font-medium text-bad-ink">
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {error}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn ${isApprove ? "btn-ok" : "btn-danger"}`}
          onClick={go}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isApprove ? (
            "Approve capture"
          ) : isDecline ? (
            "Decline"
          ) : (
            "Withdraw"
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Figure({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="label text-[9px]">{label}</div>
      <div
        className="truncate font-mono text-[12.5px] font-bold tnum"
        style={{ color: strong ? "var(--bad)" : "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function Fact({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="label text-[9.5px]">{label}</dt>
      <dd className="mt-0.5 break-words text-[12px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  HandCoins,
  Loader2,
  Store,
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

/**
 * Column widths, tuned so the Approve button fits without horizontal scroll on
 * a 1280px screen with the sidebar open.
 *
 * The minimums matter more than the fractions here: a primary action that
 * requires a sideways scroll to reach is a primary action people stop using,
 * so the text columns give up width before the decision column does.
 */
/* THE WIDTH FOLLOWED THE HEADING. Column one was sized for a load class
 * and now carries a customer code, a customer name and a registration;
 * column two was sized for a customer name and now carries the model,
 * which is the shorter of the two. The pair swapped share as well as
 * content, so nothing had to grow overall. */
const GRID =
  "minmax(176px,1.45fr) minmax(96px,0.72fr) minmax(84px,0.7fr) 46px 96px 104px 92px auto";

/**
 * One capture request as a ROW, for the desk that rules on them.
 *
 * The money is the point of this record, so the three figures get their own
 * right-aligned, tabular columns rather than sitting in a box inside a card.
 * A manager working a queue of these is comparing outstanding balances down a
 * column; on the card version that comparison was impossible because every
 * figure sat at a different x-position.
 */
export function RequestListRow({
  request,
  canDecide,
}: {
  request: RequestRow;
  canDecide: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [decision, setDecision] = useState<null | "APPROVE" | "DECLINE">(null);
  const meta = CAPTURE_REQUEST_META[request.status];
  const pending = request.status === "PENDING";
  const aged = pending && request.ageDays >= 2;

  return (
    <>
      <div
        className="grid items-center gap-x-2.5 border-b border-rule px-3 py-2 transition-colors hover:bg-surface-2"
        style={{ gridTemplateColumns: GRID }}
      >
        <div className="min-w-0">
          <AccountTitle
            record={request}
            as="div"
            className="font-display text-[13.5px] font-bold leading-tight text-ink"
          />
          <div className="truncate font-mono text-[10.5px] text-ink-3">
            {request.registrationNo}
          </div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-[12.5px] text-ink-2">
            {[request.make, request.model].filter(Boolean).join(" ") || "Vehicle"}
          </div>
        </div>

        <div className="min-w-0">
          <div className="truncate text-[12px] text-ink-2">
            {request.requestedBy?.name ?? "—"}
          </div>
          <div className="truncate font-mono text-[10.5px] text-ink-3">
            {request.territory?.name ?? "—"}
          </div>
        </div>

        <div className="text-right font-mono text-[12.5px] font-semibold tnum text-ink">
          {request.odNumber}
        </div>
        <div className="text-right font-mono text-[12.5px] tnum text-ink-2">
          {taka(request.odAmount)}
        </div>
        <div
          className="text-right font-mono text-[12.5px] font-bold tnum"
          style={{ color: "var(--bad)" }}
        >
          {taka(request.outstandingAmount)}
        </div>

        {/* Expected outcome — the officer's read on what the capture achieves.
            An icon plus a word, never colour alone. */}
        <div>
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
            style={
              request.settlementPossible
                ? {
                    background: "color-mix(in srgb, var(--ok) 12%, var(--surface))",
                    color: "var(--ok)",
                  }
                : {
                    background: "color-mix(in srgb, var(--warn) 12%, var(--surface))",
                    color: "var(--warn)",
                  }
            }
          >
            {request.settlementPossible ? <HandCoins size={11} /> : <Store size={11} />}
            {request.settlementPossible ? "Settles" : "Resale"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {pending ? (
            <span
              className="font-mono text-[11px] font-bold tnum"
              style={{ color: aged ? "var(--warn)" : "var(--ink-3)" }}
            >
              {request.ageDays === 0 ? "today" : `${request.ageDays}d`}
            </span>
          ) : (
            <Chip tone={meta.tone}>{meta.label}</Chip>
          )}

          {pending && canDecide && (
            <>
              <button
                onClick={() => setDecision("DECLINE")}
                aria-label="Decline"
                title="Decline"
                className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-bad-soft hover:text-bad-ink"
              >
                <X size={15} />
              </button>
              <button
                onClick={() => setDecision("APPROVE")}
                className="btn btn-ok btn-sm !px-2.5 !py-1"
              >
                <Check size={13} /> Approve
              </button>
            </>
          )}

          {request.status === "CAPTURED" && request.vehicleId && (
            <Link
              href={`/vehicles/${request.vehicleId}`}
              className="text-[11.5px] font-semibold text-accent"
            >
              Open <ArrowRight size={11} className="inline" />
            </Link>
          )}

          <button
            onClick={() => setExpanded((s) => !s)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide detail" : "Show detail"}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ChevronDown
              size={15}
              className="transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="border-b border-rule px-3 py-3"
          style={{ background: "var(--surface-2)", animation: "slideDown 0.16s var(--ease-standard)" }}
        >
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
            <Fact label="Raised">{shortDate(request.requestedAt)}</Fact>
            <Fact label="Officer">
              {request.requestedBy?.name ?? "—"}
              {request.requestedBy?.staffId ? ` · ${request.requestedBy.staffId}` : ""}
            </Fact>
            <Fact label="Expected outcome">
              {request.settlementPossible
                ? "Capture applies pressure; expect the dues cleared and the vehicle returned."
                : "Customer not expected to return; plan for a Credit Note and resale."}
            </Fact>
            {request.decidedAt && (
              <Fact label={`${meta.label} by`}>
                {request.decidedBy?.name ?? "—"} · {shortDate(request.decidedAt)}
              </Fact>
            )}
            <Fact label="Officer's remarks" wide>
              {request.remarks}
            </Fact>
            {request.decisionNote && (
              <Fact label="Decision note" wide>
                {request.decisionNote}
              </Fact>
            )}
          </dl>
        </div>
      )}

      {decision && (
        <DecisionModal
          decision={decision}
          request={request}
          onClose={() => setDecision(null)}
        />
      )}
    </>
  );
}

export function RequestListHeader() {
  return (
    <div
      className="grid items-center gap-x-2.5 border-b border-rule-strong px-3 py-2"
      style={{ gridTemplateColumns: GRID, background: "var(--surface-2)" }}
    >
      {["Customer", "Vehicle", "Officer"].map((h) => (
        <span key={h} className="label !mb-0 text-[9px]">
          {h}
        </span>
      ))}
      <span className="label !mb-0 text-right text-[9px]">OD #</span>
      <span className="label !mb-0 text-right text-[9px]">Overdue</span>
      <span className="label !mb-0 text-right text-[9px]">Outstanding</span>
      <span className="label !mb-0 text-[9px]">Expects</span>
      <span className="label !mb-0 text-right text-[9px]">Decision</span>
    </div>
  );
}

function DecisionModal({
  decision,
  request,
  onClose,
}: {
  decision: "APPROVE" | "DECLINE";
  request: RequestRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isApprove = decision === "APPROVE";
  const titleId = "request-decision-title";

  const go = async () => {
    if (!isApprove && !note.trim()) {
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
      toast(isApprove ? "Approved — the officer can now capture" : "Declined");
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
      size="md"
      labelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId={titleId}
        title={isApprove ? "Approve capture" : "Decline request"}
        subtitle={`${request.registrationNo} · ${request.customerName}`}
        icon={isApprove ? <Check size={17} /> : <X size={17} />}
        tone={isApprove ? "accent" : "bad"}
        onClose={busy ? undefined : onClose}
      />
      <ModalBody>
        <div className="grid grid-cols-3 gap-3 rounded-lg bg-surface-2 p-3">
          <Figure label="OD #" value={String(request.odNumber)} />
          <Figure label="Overdue" value={taka(request.odAmount)} />
          <Figure label="Outstanding" value={taka(request.outstandingAmount)} strong />
        </div>

        <div
          className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs font-medium"
          style={
            request.settlementPossible
              ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
              : { background: "var(--warn-soft)", color: "var(--warn-ink)" }
          }
        >
          <AlertTriangle size={13} className="mt-px shrink-0" />
          {request.settlementPossible
            ? "The officer expects the capture to force a settlement — plan for the vehicle to go back once the dues clear."
            : "The officer expects the customer will not return — plan for this one to reach a Credit Note and resale."}
        </div>

        <label className="label mb-1.5 mt-4 block" htmlFor="decision-note">
          {isApprove ? "Note" : "Reason"}
          {isApprove ? (
            <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
          ) : (
            <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
              required
            </span>
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
            isApprove
              ? "Any condition or instruction for the officer…"
              : "Why is this refused? What should the officer do instead?"
          }
          autoFocus
          maxLength={1000}
        />

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-xs font-medium text-bad-ink">
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
          ) : (
            "Decline"
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label !mb-0.5 text-[9px]">{label}</div>
      <div
        className="truncate font-mono text-[13px] font-bold tnum"
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
    <div className={wide ? "col-span-2 md:col-span-4" : undefined}>
      <dt className="label !mb-0.5 text-[9px]">{label}</dt>
      <dd className="break-words text-[12px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}

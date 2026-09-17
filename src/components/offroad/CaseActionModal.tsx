"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Loader2, ShieldCheck } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { CASE_ACTIONS, OFFROAD_KIND_META, type CaseAction } from "@/lib/offroad";
import type { CaseRow } from "@/lib/recoveryDesk";

/**
 * The one panel every off-road case is closed (or extended) through.
 *
 * Four actions share it because they share almost everything: the same record,
 * the same confirmation shape, the same note field. What differs is which
 * fields appear and how loudly the panel warns — a case going back on the road
 * is routine; a case converting into a repossession is not, and the NOC field
 * is what stands between them.
 */
export function CaseActionModal({
  open,
  action,
  kase,
  onClose,
  onDone,
}: {
  open: boolean;
  action: CaseAction;
  kase: CaseRow;
  onClose: () => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [noc, setNoc] = useState("");
  const [days, setDays] = useState(String(kase.revisedDays ?? kase.approxDays));
  const [nocConfirmed, setNocConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meta = CASE_ACTIONS[action];
  const kind = OFFROAD_KIND_META[kase.kind];
  const titleId = "case-action-title";

  const isConvert = action === "CONVERT_TO_CAPTURE";
  const isRevise = action === "REVISE_TIMELINE";
  const isRelease = action === "RELEASE_TO_CUSTOMER";

  const reset = () => {
    setNote("");
    setNoc("");
    setNocConfirmed(false);
    setError("");
  };

  const go = async () => {
    // Client-side guards mirror the schema rather than replace it: the server
    // refuses the same things, this just avoids a round trip to be told so.
    if (isConvert && !noc.trim()) {
      setError("An NOC reference is required before converting to a capture.");
      return;
    }
    if (isConvert && !nocConfirmed) {
      setError("Confirm you are holding the NOC document.");
      return;
    }
    if (isRelease && !note.trim()) {
      setError("A reason is required when releasing to the customer.");
      return;
    }
    if (isRevise && (!days || Number(days) < 1)) {
      setError("Give the revised number of days.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await sendJSON<{ nextStep: string | null }>(
        `/api/offroad/${kase.id}`,
        "PATCH",
        {
          action,
          note: note.trim(),
          ...(isConvert ? { nocReference: noc.trim() } : {}),
          ...(isRevise ? { revisedDays: Number(days) } : {}),
        },
      );
      reset();
      onDone?.();
      // A conversion is only half done here: the case is closed and the
      // officer is handed to the capture form, which is the only thing allowed
      // to create a vehicle.
      if (res?.nextStep) {
        toast("Case converted — now complete the capture");
        router.push(res.nextStep);
      } else {
        toast(successCopy(action));
        router.refresh();
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        reset();
        onClose();
      }}
      variant="mobile"
      size="md"
      labelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId={titleId}
        title={meta.label}
        subtitle={`${kase.registrationNo} · ${kind.label} case`}
        icon={
          isConvert ? (
            <ShieldCheck size={17} />
          ) : isRevise ? (
            <Clock size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )
        }
        tone={isConvert ? "bad" : "accent"}
        onClose={busy ? undefined : onClose}
      />

      <ModalBody>
        <div
          className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
          style={
            isConvert
              ? { borderColor: "var(--bad)", background: "var(--bad-soft)", color: "var(--bad-ink)" }
              : {
                  borderColor: "var(--rule-strong)",
                  background: "var(--surface-2)",
                  color: "var(--ink-2)",
                }
          }
        >
          {isConvert ? (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="font-medium">{meta.detail}</span>
            </div>
          ) : (
            meta.detail
          )}
        </div>

        {isRevise && (
          <>
            <label className="label mb-1.5 mt-4 block" htmlFor="revised-days">
              Revised estimate
            </label>
            <div className="flex items-center gap-2">
              <input
                id="revised-days"
                type="number"
                min={1}
                max={730}
                className="field font-mono tnum"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                autoFocus
              />
              <span className="shrink-0 text-[13px] text-ink-2">days</span>
            </div>
            <p className="mt-1.5 font-mono text-[10.5px] text-ink-3">
              Field estimate was {kase.approxDays} days. The original is kept on record.
            </p>
          </>
        )}

        {isConvert && (
          <>
            <label className="label mb-1.5 mt-4 block" htmlFor="noc-ref">
              NOC reference
              <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
                required
              </span>
            </label>
            <input
              id="noc-ref"
              className="field font-mono uppercase"
              value={noc}
              onChange={(e) => {
                setNoc(e.target.value);
                if (error) setError("");
              }}
              placeholder="NOC-2026-0142"
              maxLength={120}
              autoFocus
            />
            <label className="mt-3 flex cursor-pointer items-start gap-2.5 rounded-lg border border-rule bg-surface-2 px-3 py-2.5">
              <input
                type="checkbox"
                className="mt-0.5 shrink-0"
                checked={nocConfirmed}
                onChange={(e) => {
                  setNocConfirmed(e.target.checked);
                  if (error) setError("");
                }}
              />
              <span className="text-[12.5px] leading-snug text-ink-2">
                I confirm the signed NOC is in hand and the customer has no further claim on
                this vehicle.
              </span>
            </label>
          </>
        )}

        <label className="label mb-1.5 mt-4 block" htmlFor="case-note">
          {isRevise ? "Why the change" : "Remarks"}
          {isRelease ? (
            <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
              required
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
          )}
        </label>
        <textarea
          id="case-note"
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={placeholderFor(action)}
          maxLength={1000}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-ink-3">Recorded on the case trail.</span>
          <span className="font-mono text-[10px] tnum text-ink-3">{note.length}/1000</span>
        </div>

        {error && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-xs font-medium text-bad-ink"
            style={{ animation: "scaleIn 0.15s var(--ease-spring)" }}
          >
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
          className={`btn ${isConvert ? "btn-danger" : isRevise ? "btn-primary" : "btn-ok"}`}
          onClick={go}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              {meta.label}
              {isConvert && <ArrowRight size={14} />}
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function placeholderFor(action: CaseAction): string {
  switch (action) {
    case "MARK_ONROAD":
      return "Repair completed, vehicle handed back…";
    case "RELEASE_TO_CUSTOMER":
      return "Court released the vehicle to the owner on…";
    case "CONVERT_TO_CAPTURE":
      return "Written off by the surveyor; customer has signed the NOC…";
    case "REVISE_TIMELINE":
      return "Parts on back order; workshop needs another two weeks…";
  }
}

function successCopy(action: CaseAction): string {
  switch (action) {
    case "MARK_ONROAD":
      return "Marked back on-road — case closed";
    case "RELEASE_TO_CUSTOMER":
      return "Released to customer — case closed";
    case "REVISE_TIMELINE":
      return "Timeline revised";
    default:
      return "Case updated";
  }
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseFlagKind } from "@prisma/client";
import { AlertTriangle, CheckCircle2, Flag, Loader2, Undo2 } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { FLAG_META } from "@/lib/offroad";
import { shortDate } from "@/lib/format";
import type { CaseRow, FlagRow } from "@/lib/recoveryDesk";

const MIN_NOTE = 20;

/**
 * Raise a flag on a case.
 *
 * The note is the flag. A twenty-character floor is enforced here and again on
 * the server, and the counter counts UP to it rather than down from a maximum
 * — the thing being encouraged is saying enough, not stopping in time.
 */
export function RaiseFlagModal({
  kind,
  kase,
  onClose,
}: {
  kind: CaseFlagKind;
  kase: CaseRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meta = FLAG_META[kind];
  const titleId = "raise-flag-title";
  const short = note.trim().length < MIN_NOTE;

  const go = async () => {
    if (short) {
      setError(`Say a little more — ${MIN_NOTE - note.trim().length} more characters.`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/offroad/${kase.id}/flags`, "POST", { kind, note: note.trim() });
      toast(
        kind === "SUPPORT_REQUEST"
          ? "Support requested — the desk can see it now"
          : "Flagged for the officer",
      );
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not raise the flag");
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
        title={meta.raiseLabel}
        subtitle={`${kase.registrationNo} · ${kase.customerName}`}
        icon={<Flag size={17} />}
        tone={kind === "SUPPORT_REQUEST" ? "accent" : "warn"}
        onClose={busy ? undefined : onClose}
      />
      <ModalBody>
        <div className="rounded-lg border border-rule-strong bg-surface-2 px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">
          {meta.detail}
        </div>

        <label className="label mb-1.5 mt-4 block" htmlFor="flag-note">
          What is needed
          <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
            required
          </span>
        </label>
        <textarea
          id="flag-note"
          className="field resize-none text-sm"
          rows={4}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={meta.placeholder}
          autoFocus
          maxLength={1000}
        />
        <div className="mt-1 flex items-center justify-between">
          <span
            className="font-mono text-[10px]"
            style={{ color: short ? "var(--warn)" : "var(--ok)" }}
          >
            {short ? `${MIN_NOTE - note.trim().length} more characters` : "Ready to send"}
          </span>
          <span className="font-mono text-[10px] tnum text-ink-3">{note.length}/1000</span>
        </div>

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
        <button className="btn btn-primary" onClick={go} disabled={busy || short}>
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <>
              <Flag size={14} /> {meta.raiseLabel}
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

/**
 * Close a flag — answered, or withdrawn.
 *
 * One panel for both, because the record is the same and only the framing
 * changes. `withdrawing` is passed rather than derived so the caller (which
 * already knows whose flag it is) does not have to hand the modal a user id.
 */
export function ResolveFlagModal({
  flag,
  caseId,
  withdrawing,
  onClose,
}: {
  flag: FlagRow;
  caseId: string;
  withdrawing: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const meta = FLAG_META[flag.kind];
  const titleId = "resolve-flag-title";

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/offroad/${caseId}/flags/${flag.id}`, "PATCH", {
        resolutionNote: note.trim(),
      });
      toast(withdrawing ? "Flag withdrawn" : "Flag closed");
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close the flag");
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
        title={withdrawing ? `Withdraw ${meta.label.toLowerCase()}` : meta.resolveLabel}
        subtitle={`Raised ${shortDate(flag.raisedAt)} by ${flag.raisedBy?.name ?? "—"}`}
        icon={withdrawing ? <Undo2 size={17} /> : <CheckCircle2 size={17} />}
        tone={withdrawing ? "neutral" : "accent"}
        onClose={busy ? undefined : onClose}
      />
      <ModalBody>
        <div className="rounded-lg border border-rule-strong bg-surface-2 px-3 py-2.5">
          <div className="label text-[9.5px]">What was asked</div>
          <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink-2">
            {flag.note}
          </p>
        </div>

        <label className="label mb-1.5 mt-4 block" htmlFor="resolve-note">
          {withdrawing ? "Why withdraw it" : "What you did"}
          <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
        </label>
        <textarea
          id="resolve-note"
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={
            withdrawing
              ? "No longer needed — the workshop called back…"
              : "Authorisation sent to the workshop this morning…"
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
        <button className="btn btn-ok" onClick={go} disabled={busy}>
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : withdrawing ? (
            "Withdraw"
          ) : (
            meta.resolveLabel
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

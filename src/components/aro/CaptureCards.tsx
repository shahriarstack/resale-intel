"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Lock,
  Loader2,
  ChevronRight,
  ChevronDown,
  Send,
  LogOut,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { sendJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { LETTER_META, STATUS_META } from "@/lib/status";
import { vehicleTitle } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { shortDate } from "@/lib/format";
import { LetterConfirmModal } from "@/components/aro/LetterConfirmModal";
import { LetterLadder } from "@/components/aro/LetterLadder";
import { LetterRing } from "@/components/aro/LetterRing";
import { TruckArt, PipelineArt } from "@/components/aro/Art";
import type { LetterStep } from "@/lib/letterSchedule";
import type { CaptureRow } from "@/lib/recoveryDesk";

interface Engineer {
  id: string;
  name: string;
  staffId: string;
}

/**
 * A captured vehicle in the officer's hands.
 *
 * Compact by default, expandable on tap. The old card showed the whole letter
 * ladder, an engineer picker and two buttons on every row — about 260px per
 * vehicle, so an officer holding twelve scrolled through three screens of
 * controls to find the one file that needed them.
 *
 * The collapsed row is built around a single question: **what do I owe on this
 * file today**. `next` answers it — serve the next letter, or request the
 * Credit Note once the ladder has run — and the row carries that instruction
 * and the button that performs it. Everything else is detail, and detail is
 * behind the disclosure.
 *
 * The ladder itself needs no decisions from anyone: Letter 1 falls due the day
 * after capture, Letter 2 seven days after Letter 1, Letter 3 seven days after
 * that, and serving Letter 3 locks the file to a Credit Note. Because there is
 * no choice to make, the card does not offer one — it states the step and
 * offers the one action that takes it.
 */
export function ActiveCard({ vehicle, engineers }: { vehicle: CaptureRow; engineers: Engineer[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "RELEASE" | "REQUEST_CN">(null);
  const [pendingLetter, setPendingLetter] = useState<LetterStep | null>(null);

  const locked = vehicle.isLocked;
  const { letters, next } = vehicle;

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await sendJSON(`/api/vehicles/${vehicle.id}`, "PATCH", body);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setBusy(false);
    }
  };

  const commitLetter = async () => {
    if (!pendingLetter) return;
    await patch({ letterStage: pendingLetter.key });
    toast(`${pendingLetter.label} issued`);
    setPendingLetter(null);
  };

  const tone = toneVar(next.tone);
  // The prompt is loud only when something is actually owed. A file with four
  // days left is fine, and a card that shouts at every vehicle every day is a
  // card people stop reading.
  const loud = next.due || next.overdue;

  return (
    <article className="card overflow-hidden">
      {/* ---- The instruction ----
          The whole reason this row exists. Serve the letter, or request the
          Credit Note; never both, never a choice.
          
          Rendered for the NONE case too. A file whose Credit Note is sitting
          with the manager owes the officer nothing — but a card that says
          nothing at all reads as broken, and "Credit Note with the manager"
          is the answer to the question they opened the card to ask. */}
      {(
        <div
          className="flex items-center gap-2 px-3 py-1.5"
          style={{
            background: loud
              ? `color-mix(in srgb, ${tone} 13%, var(--surface))`
              : "var(--surface-2)",
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: loud ? tone : "var(--ink-3)" }}
          />
          <span
            className="min-w-0 flex-1 truncate text-[11.5px] font-bold"
            style={{ color: loud ? tone : "var(--ink-2)" }}
          >
            {next.label}
          </span>
          {/* Fragment, not a sentence — see the NextAction type. Allowed to
              shrink so a long one can never push the instruction off the row. */}
          <span className="min-w-0 shrink truncate font-mono text-[10.5px] text-ink-3">
            {next.detail}
          </span>
        </div>
      )}

      {/* ---- The row ---- */}
      <button
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left"
      >
        <span className="aro-art h-8 w-8 shrink-0" style={{ ["--tone" as string]: "#4338ca" }}>
          <TruckArt size={21} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {/* The account, not the load class. An officer scanning their
                captures is looking for a customer they are about to ring or
                visit — see lib/vehicle.ts. */}
            <AccountTitle record={vehicle} as="span" className="f-item" />
            {locked && <Lock size={11} className="shrink-0 text-ink-3" />}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            {/* Registration alone. Appending the model here cut the
                REGISTRATION — "DEMO-OR-RAJ-11-904…" — on a row that also
                carries a letter chip and a countdown ring, and a registration
                that identifies nothing is the one thing this line may not do.
                The model has no privileged place on a dense row anyway: the
                fleet is one make, and the load class is in the detail below
                for whoever needs it. */}
            <span className="truncate font-mono text-[10.5px] text-ink-3">
              {vehicle.registrationNo}
            </span>
            <Chip tone={LETTER_META[vehicle.letterStage].tone}>
              {LETTER_META[vehicle.letterStage].label}
            </Chip>
          </span>
        </span>

        {/* The ladder, as a ring. Sits where the off-road card puts its clock,
            so the two working screens read the same way round: identity on the
            left, the countdown on the right. */}
        <LetterRing schedule={letters} next={next} />

        <ChevronDown
          size={15}
          className="-ml-0.5 shrink-0 text-ink-3 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : undefined }}
        />
      </button>

      {/* ---- The one action, when there is one ---- */}
      <div className={next.kind === "NONE" ? "hidden" : "px-3 pb-2.5"}>
        {next.kind === "REQUEST_CN" ? (
          <button
            className="btn btn-gradient btn-sm w-full"
            disabled={busy}
            onClick={() => setConfirm("REQUEST_CN")}
          >
            <Send size={14} /> Request Credit Note
            <ArrowRight size={14} />
          </button>
        ) : next.kind === "ISSUE_LETTER" ? (
          <button
            className={`btn btn-sm w-full ${loud ? "btn-primary" : "btn-ghost"}`}
            disabled={busy}
            onClick={() => setPendingLetter(next.step)}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {next.label}
          </button>
        ) : null}
      </div>

      {/* ---- Detail ---- */}
      {open && (
        <div
          className="border-t border-rule px-3 py-2.5"
          style={{ background: "var(--surface-2)", animation: "slideDown 0.16s var(--ease-standard)" }}
        >
          <LetterLadder
            schedule={letters}
            disabled={busy}
            onIssue={(step) => setPendingLetter(step)}
          />

          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
            {/* Customer is the heading now; the vehicle takes its place here,
                which is where somebody looks when they need the load class. */}
            <Fact label="Vehicle">{vehicleTitle(vehicle)}</Fact>
            <Fact label="Territory">{vehicle.territory?.name ?? "—"}</Fact>
            <Fact label="Captured">{shortDate(vehicle.captureDate)}</Fact>
            <Fact label="Engineer">{vehicle.assignedEngineer?.name ?? "Not assigned"}</Fact>
          </dl>

          <div className="float-field mt-2.5">
            <span className="float-label">Reassign engineer</span>
            <select
              className="field"
              value={vehicle.assignedEngineerId ?? ""}
              disabled={busy || locked}
              onChange={(e) => patch({ assignedEngineerId: e.target.value })}
              aria-label="Assign engineer"
            >
              <option value="" disabled>
                Select…
              </option>
              {engineers.map((eng) => (
                <option key={eng.id} value={eng.id}>
                  {eng.name}
                </option>
              ))}
            </select>
          </div>

          {letters.releaseLocked ? (
            <div
              className="mt-2.5 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[11.5px] leading-snug"
              style={{ background: "var(--surface-3)", color: "var(--ink-2)" }}
            >
              <Lock size={12} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} />
              <span>{letters.lockReason}</span>
            </div>
          ) : (
            <button
              className="btn btn-ghost btn-sm mt-2.5 w-full"
              disabled={busy}
              onClick={() => setConfirm("RELEASE")}
            >
              <LogOut size={14} /> Release to customer
            </button>
          )}

          <Link
            href={`/vehicles/${vehicle.id}`}
            className="mt-2 flex items-center justify-center gap-1 py-1 text-[11.5px] font-semibold text-accent"
          >
            Open the full file <ExternalLink size={12} />
          </Link>
        </div>
      )}

      <ActionConfirm
        open={confirm !== null}
        kind={confirm ?? "RELEASE"}
        vehicle={vehicle}
        onClose={() => setConfirm(null)}
        onDone={() => {
          setConfirm(null);
          router.refresh();
        }}
      />

      {pendingLetter !== null && (
        <LetterConfirmModal
          open
          from={vehicle.letterStage}
          to={pendingLetter.key}
          vehicleName={vehicleTitle(vehicle)}
          registrationNo={vehicle.registrationNo}
          onCancel={() => setPendingLetter(null)}
          onConfirm={commitLetter}
          busy={busy}
        />
      )}
    </article>
  );
}

/** The compact row used for files sitting at other desks, and for closed ones. */
export function CompactCard({ vehicle }: { vehicle: CaptureRow }) {
  const meta = STATUS_META[vehicle.status];

  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className="card card-hover flex items-center gap-2.5 p-2"
    >
      <span className="aro-art h-8 w-8 shrink-0" style={{ ["--tone" as string]: "#2563eb" }}>
        <PipelineArt size={19} />
      </span>

      <span className="min-w-0 flex-1">
        <AccountTitle record={vehicle} as="span" className="f-item" />
        <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-3">
          {vehicle.registrationNo}
          {meta.heldBy !== "—" && ` · with ${meta.heldBy}`}
        </span>
      </span>

      <Chip tone={meta.tone}>{meta.label}</Chip>
      <ChevronRight size={15} className="shrink-0 text-ink-3" />
    </Link>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="label !mb-0.5 text-[9px]">{label}</dt>
      <dd className="truncate text-[12px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}

function toneVar(tone: string): string {
  switch (tone) {
    case "ok":
      return "var(--ok)";
    case "warn":
      return "var(--warn)";
    case "bad":
      return "var(--bad)";
    case "accent":
      return "var(--accent)";
    default:
      return "var(--ink-3)";
  }
}

function ActionConfirm({
  open,
  kind,
  vehicle,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: "RELEASE" | "REQUEST_CN";
  vehicle: CaptureRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRelease = kind === "RELEASE";
  const titleId = "action-confirm-title";

  const go = async () => {
    if (isRelease && !note.trim()) {
      setError("A reason is required to release the vehicle.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicle.id}/transition`, "POST", { action: kind, note });
      setNote("");
      onDone();
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
        setError("");
        setNote("");
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
        title={isRelease ? "Release to customer" : "Request Credit Note"}
        subtitle={`${vehicleTitle(vehicle)} · ${vehicle.registrationNo}`}
        icon={isRelease ? <LogOut size={17} /> : <Send size={17} />}
        tone={isRelease ? "bad" : "accent"}
        onClose={busy ? undefined : onClose}
      />

      <ModalBody>
        <div
          className="rounded-lg px-3 py-2.5 text-[13px] leading-relaxed"
          style={
            isRelease
              ? { background: "var(--bad-soft)", color: "var(--bad-ink)" }
              : { background: "var(--surface-2)", color: "var(--ink-2)" }
          }
        >
          {isRelease ? (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="font-medium">
                The vehicle leaves the pipeline permanently. This action cannot be reversed —
                capture it again from scratch if the vehicle is re-recovered.
              </span>
            </div>
          ) : (
            "Sends the file to the Recovery Manager for Credit Note approval. You can add context (territory, buyer interest, timing) to help their review."
          )}
        </div>

        <label className="label mb-1.5 mt-4 block">
          Reason
          {isRelease ? (
            <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
              required
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
          )}
        </label>
        <textarea
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={
            isRelease ? "Why is this vehicle being released?" : "Territory, buyer interest, timing…"
          }
          autoFocus
          maxLength={1000}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-ink-3">
            {isRelease ? "This reason is recorded on the audit trail." : ""}
          </span>
          <span className="font-mono text-[10px] tnum text-ink-3">{note.length}/1000</span>
        </div>

        {error && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg bg-bad-soft px-3 py-2 text-xs font-medium text-bad-ink"
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
          className={`btn ${isRelease ? "btn-danger" : "btn-primary"}`}
          onClick={go}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isRelease ? (
            "Confirm release"
          ) : (
            "Request Credit Note"
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

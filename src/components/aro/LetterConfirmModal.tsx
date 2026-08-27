"use client";

import { useState } from "react";
import type { LetterStage } from "@prisma/client";
import { Mail, Loader2, ArrowRight, Lock, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { LETTER_META } from "@/lib/status";
import {
  LETTER_LADDER,
  letterChange,
  letterConfirmTone,
  letterDescription,
  letterLocks,
  letterRung,
  letterVerb,
  letterWarnings,
} from "@/lib/letter";

/**
 * Confirmation for a letter-stage change on the ARO active card.
 *
 * The visual is the ladder itself: each rung as a compact chip laid out in
 * order, the current one flagged and the target one lit. That makes the
 * escalation direction obvious at a glance — instead of a raw dropdown
 * committing the change immediately, the officer sees where the file is
 * moving and why it matters.
 */
export function LetterConfirmModal({
  open,
  from,
  to,
  vehicleName,
  registrationNo,
  onCancel,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  from: LetterStage;
  to: LetterStage;
  vehicleName: string;
  registrationNo: string;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
  busy?: boolean;
}) {
  const change = letterChange(from, to);
  const tone = letterConfirmTone(to);
  const warnings = letterWarnings(from, to);
  const willLock = !letterLocks(from) && letterLocks(to);
  const titleId = "letter-confirm-title";

  const verb = letterVerb(change);
  const title =
    change.kind === "same"
      ? "Update letter"
      : `${verb} to ${LETTER_META[to].label}`;

  const subtitle = `${vehicleName} · ${registrationNo}`;

  return (
    <Modal
      open={open}
      onClose={onCancel}
      variant="mobile"
      size="md"
      labelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId={titleId}
        title={title}
        subtitle={subtitle}
        icon={willLock ? <Lock size={17} /> : <Mail size={17} />}
        tone={tone}
        onClose={busy ? undefined : onCancel}
      />

      <ModalBody>
        {/* Ladder — the visible metaphor for the escalation. */}
        <Ladder from={from} to={to} tone={tone} change={change} />

        <div className="mt-4 rounded-lg border border-rule bg-surface-2 p-3">
          <div className="label mb-1">What this means</div>
          <p className="text-[13px] leading-relaxed text-ink-2">{letterDescription(to)}</p>
        </div>

        {warnings.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {warnings.map((w) => (
              <li
                key={w}
                className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor:
                    tone === "bad"
                      ? "var(--bad)"
                      : tone === "warn"
                        ? "var(--warn)"
                        : "var(--rule-strong)",
                  background:
                    tone === "bad"
                      ? "var(--bad-soft)"
                      : tone === "warn"
                        ? "var(--warn-soft)"
                        : "var(--surface-2)",
                  color:
                    tone === "bad"
                      ? "var(--bad)"
                      : tone === "warn"
                        ? "var(--warn)"
                        : "var(--ink-2)",
                }}
              >
                <AlertCircle size={13} className="mt-px shrink-0" />
                <span className="font-medium">{w}</span>
              </li>
            ))}
          </ul>
        )}
      </ModalBody>

      <ModalFooter>
        <button className="btn btn-ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn ${tone === "bad" ? "btn-danger" : tone === "warn" ? "btn-primary" : "btn-primary"}`}
          onClick={onConfirm}
          disabled={busy || change.kind === "same"}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : change.kind === "same" ? (
            "No change"
          ) : (
            <>
              {verb} <ArrowRight size={15} />
            </>
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The ladder visual.
//
// Each rung is a compact horizontal card with a rung number, the stage label,
// and (for the target) a summary of the movement. Rungs already crossed show
// muted; the current rung is outlined; the target rung is filled with the
// tone colour; rungs beyond are dim.
// ---------------------------------------------------------------------------

function Ladder({
  from,
  to,
  tone,
  change,
}: {
  from: LetterStage;
  to: LetterStage;
  tone: "accent" | "warn" | "bad" | "neutral";
  change: ReturnType<typeof letterChange>;
}) {
  const fromIndex = letterRung(from);
  const toIndex = letterRung(to);

  const accent =
    tone === "bad"
      ? "var(--bad)"
      : tone === "warn"
        ? "var(--warn)"
        : "var(--accent)";
  const accentSoft =
    tone === "bad"
      ? "var(--bad-soft)"
      : tone === "warn"
        ? "var(--warn-soft)"
        : "var(--accent-soft)";

  const DirIcon = change.kind === "down" ? ChevronDown : ChevronUp;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="mb-1 flex items-center justify-between">
        <span className="label">Letter ladder</span>
        {change.kind !== "same" && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
            style={{ background: accentSoft, color: accent }}
          >
            <DirIcon size={11} />
            {change.steps} step{change.steps === 1 ? "" : "s"} {change.kind}
          </span>
        )}
      </div>

      {LETTER_LADDER.map((stage, i) => {
        const isFrom = i === fromIndex;
        const isTo = i === toIndex;
        const passed = i < Math.min(fromIndex, toIndex);
        const inRange = i > Math.min(fromIndex, toIndex) && i < Math.max(fromIndex, toIndex);
        const beyond = i > Math.max(fromIndex, toIndex);
        const locks = letterLocks(stage);

        return (
          <div
            key={stage}
            className="flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors"
            style={
              isTo
                ? {
                    borderColor: accent,
                    background: accentSoft,
                    color: accent,
                  }
                : isFrom
                  ? {
                      borderColor: "var(--rule-strong)",
                      background: "var(--surface-2)",
                    }
                  : inRange
                    ? {
                        borderColor: "var(--rule)",
                        background: "var(--surface)",
                        opacity: 0.75,
                      }
                    : {
                        borderColor: "var(--rule)",
                        background: "var(--surface)",
                        opacity: passed ? 0.55 : beyond ? 0.4 : 1,
                      }
            }
          >
            <span
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold"
              style={
                isTo
                  ? { background: accent, color: "var(--on-accent)" }
                  : isFrom
                    ? { background: "var(--ink-3)", color: "#fff" }
                    : { background: "var(--surface-3)", color: "var(--ink-3)" }
              }
            >
              {i}
            </span>
            <span
              className="flex-1 text-[13px] font-semibold leading-tight"
              style={isTo ? { color: accent } : undefined}
            >
              {LETTER_META[stage].label}
            </span>
            {isFrom && !isTo && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
              >
                Now
              </span>
            )}
            {isTo && (
              <span
                className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
                style={{ background: accent, color: "var(--on-accent)" }}
              >
                {change.kind === "same" ? "Selected" : "Target"}
              </span>
            )}
            {locks && !isFrom && !isTo && (
              <Lock size={12} className="shrink-0 text-ink-3" aria-label="Locks the record" />
            )}
            {locks && (isFrom || isTo) && (
              <Lock
                size={12}
                className="shrink-0"
                style={{ color: isTo ? accent : "var(--ink-3)" }}
                aria-label="Locks the record"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

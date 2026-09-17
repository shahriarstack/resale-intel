"use client";

import { Check, Lock } from "lucide-react";
import type { LetterSchedule, LetterStep } from "@/lib/letterSchedule";
import { shortDate } from "@/lib/format";

/**
 * The escalation ladder as three rungs with dates on them.
 *
 * This replaced a plain dropdown, and the reason is the schedule: Letter 1 is
 * owed the day after capture, Letter 2 seven days after Letter 1, Letter 3
 * seven days after that. A dropdown can record which rung you are on but says
 * nothing about whether you are late for the next one — which is the only
 * question an officer with forty files actually has.
 *
 * Exactly one rung is tappable at a time: the next one owed. The ladder is a
 * sequence, and letting someone jump to Letter 3 from nothing would put a
 * final notice on a customer who never got a first.
 */
export function LetterLadder({
  schedule,
  onIssue,
  disabled,
}: {
  schedule: LetterSchedule;
  onIssue: (step: LetterStep) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="label text-[9.5px]">Letter schedule</span>
        {schedule.overdueCount > 0 && (
          <span className="font-mono text-[10px] font-bold" style={{ color: "var(--bad)" }}>
            {schedule.overdueCount} overdue
          </span>
        )}
        {schedule.complete && (
          <span className="font-mono text-[10px] font-bold" style={{ color: "var(--ok)" }}>
            complete
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {schedule.steps.map((step) => (
          <Rung
            key={step.key}
            step={step}
            disabled={disabled}
            onClick={() => onIssue(step)}
          />
        ))}
      </div>
    </div>
  );
}

function Rung({
  step,
  disabled,
  onClick,
}: {
  step: LetterStep;
  disabled?: boolean;
  onClick: () => void;
}) {
  const tappable = step.isNext && !disabled;
  const color = toneVar(step.tone);

  // An issued letter shows the day it went out (or just "issued" for a legacy
  // record that has a stage and no date); a pending one shows how long is left
  // against its deadline.
  const detail = step.issued
    ? step.issuedAt
      ? shortDate(step.issuedAt)
      : "issued"
    : step.overdue
      ? `${Math.abs(step.daysLeft)}d late`
      : step.daysLeft === 0
        ? "due today"
        : `in ${step.daysLeft}d`;

  const Wrapper = tappable ? "button" : "div";

  return (
    <Wrapper
      {...(tappable ? { onClick, type: "button" as const } : {})}
      aria-label={
        tappable ? `Issue ${step.label}, due ${shortDate(step.dueAt)}` : undefined
      }
      className={`flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-center transition-colors ${
        tappable ? "cursor-pointer hover:brightness-95" : ""
      }`}
      style={{
        borderColor: step.issued || step.overdue || tappable ? color : "var(--rule)",
        background: step.issued
          ? "var(--ok-soft)"
          : step.overdue
            ? "var(--bad-soft)"
            : tappable
              ? "var(--surface-2)"
              : "var(--surface)",
        opacity: !step.issued && !step.isNext ? 0.5 : 1,
      }}
    >
      <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold" style={{ color }}>
        {step.issued && <Check size={10} strokeWidth={3} />}
        {step.label.replace("Letter ", "L")}
      </span>
      <span className="font-mono text-[9.5px] leading-none text-ink-3 tnum">{detail}</span>
    </Wrapper>
  );
}

/** The banner shown where the Release button used to be, once it is shut. */
export function ReleaseLockNote({ reason }: { reason: string }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11.5px] leading-snug"
      style={{
        borderColor: "var(--rule-strong)",
        background: "var(--surface-2)",
        color: "var(--ink-2)",
      }}
    >
      <Lock size={12} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} />
      <span>{reason}</span>
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

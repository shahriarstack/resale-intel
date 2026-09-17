"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, MessageSquarePlus, X, Camera, Lock, ArrowRight } from "lucide-react";
import { FinishWorkModal, type Pair } from "@/components/engineer/HandoverSheet";
import type { RepairBlocker, RepairStage } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { useToast } from "@/components/ui/Toast";
import {
  BLOCKERS,
  BLOCKER_META,
  REPAIR_STAGES,
  REPAIR_STAGE_META,
  blockedLabel,
  canReportStage,
  currentStage,
  isStageAdvance,
  stageLabel,
} from "@/lib/repair";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { timeAgo } from "@/lib/format";

/**
 * The engineer's repair progress control.
 *
 * Design constraint that drove everything here: this is filed on a phone, in a
 * workshop, by someone holding a tool. So the whole report is ONE tap. Four
 * stage buttons are always visible and tapping one submits immediately; the
 * note is a separate, optional second step that never blocks the report.
 *
 * A form with a dropdown, a text box and a Save button would be more
 * conventional and would not get filled in.
 */
export function RepairProgress({
  vehicleId,
  stage,
  blocker,
  note,
  at,
  compact = false,
  handover,
  handoverPairs,
  vehicleName,
}: {
  vehicleId: string;
  stage: RepairStage | null;
  /** Why it is blocked, when it is. Only ever set alongside AWAITING_PARTS. */
  blocker: RepairBlocker | null;
  note: string | null;
  at: string | null;
  /** Card context: tighter, no heading. */
  compact?: boolean;
  /**
   * The post-repair photographs, and how far through them the engineer is.
   *
   * READY is refused by the server without all five. Rather than disable the
   * button — a locked door with no handle — tapping it opens the finish step,
   * which is where the photographs get taken. The rule is the same; it is just
   * expressed as the next thing to do instead of as a refusal. The other three
   * stages are untouched and stay one tap.
   */
  handover?: { done: number; required: number; complete: boolean };
  /** Recovery shot beside post-repair shot, for the finish step. */
  handoverPairs?: Pair[];
  /** Names the vehicle in the finish dialog. */
  vehicleName?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState<RepairStage | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [finishing, setFinishing] = useState(false);
  /** The forward step waiting on a yes. Sideways moves never land here. */
  const [confirming, setConfirming] = useState<RepairStage | null>(null);
  /** The reason picked in the dialog, for the blocked step only. */
  const [why, setWhy] = useState<RepairBlocker>("PARTS");
  const [whyNote, setWhyNote] = useState("");

  // An approved repair is already under way — see `currentStage`. Everything
  // below compares against this rather than the raw column, so an unreported
  // file behaves exactly like one reported in progress.
  const at_ = currentStage(stage);

  /**
   * Open the rail on the stage the job is actually at.
   *
   * The four pills overflow a phone-width card, and READY — the last of them
   * and the one that finishes the job — is the pill most often off the edge.
   * A control that hides its own current value is worse than one that scrolls,
   * so the track scrolls itself to the selected pill as soon as it mounts.
   *
   * A callback ref rather than an effect: it runs when the node arrives and
   * again if it is replaced, which is exactly the moment this needs to happen,
   * and it keeps a scroll side-effect out of the render-effect path.
   */
  const railRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const on = node.querySelector<HTMLElement>('[data-on="true"]');
    if (!on) return;
    // `nearest` so a pill already in view is left alone — re-centring one that
    // is fine to begin with makes the card twitch on every render.
    on.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);

  async function report(next: RepairStage, withNote?: string, withBlocker?: RepairBlocker) {
    setBusy(next);
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/progress`, "POST", {
        stage: next,
        blocker: next === "AWAITING_PARTS" ? (withBlocker ?? "PARTS") : undefined,
        note: withNote?.trim() || undefined,
      });
      toast(`Marked ${REPAIR_STAGE_META[next].label.toLowerCase()}`, "ok");
      setNoteOpen(false);
      setDraft("");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "bad");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={compact ? "mt-2.5" : "mt-3"}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.13em] text-ink-3">
            Repair progress
          </span>
          {at && (
            <span className="font-mono text-[10px] text-ink-3">
              updated {timeAgo(at)}
            </span>
          )}
        </div>
      )}

      {/* One tap files the report.
          One scrollable row, not a wrapping block. Four stage pills wrapped to
          two lines on every phone-width card, which cost a row on every vehicle
          in repair — and the row it cost was taller than the thing it was
          reporting. Scrolling sideways is the same gesture the bench rail above
          already asks for. */}
      <div className="stage-rail no-scrollbar" ref={railRef}>
        {REPAIR_STAGES.map((s) => {
          const meta = REPAIR_STAGE_META[s];
          const on = at_ === s;
          const loading = busy === s;
          // Behind where the job has got to. Shown, not hidden: the rail is a
          // record of the route as well as a control, and a stage that
          // disappears once passed leaves an engineer wondering whether they
          // ever filed it.
          // The RATCHET reads the raw column; the RAIL shows the derived one.
          // On an unreported repair those differ on purpose: it displays "in
          // progress" as the default, and nothing is locked, because the
          // engineer has not claimed anything yet — including the right to say
          // it has not started. The ratchet binds from the first real report.
          const locked = !on && !canReportStage(stage, s);
          const advance = isStageAdvance(stage, s);
          // The blocked pill says what it is blocked ON once it is the current
          // stage. "Awaiting parts" on a repair stopped by a missing lift is
          // the label doing the opposite of its job.
          const label = s === "AWAITING_PARTS" && on ? blockedLabel(blocker) : meta.label;
          // READY opens the finish step while photographs are outstanding.
          const opensFinish = s === "READY" && !!handover && !handover.complete && !!handoverPairs;
          return (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // The blocked step re-opens even when it is already current:
                // changing what the job is waiting ON is a new report.
                if (locked || (on && s !== "AWAITING_PARTS")) return;
                // The finish step IS the confirmation for READY: it asks for
                // the five photographs, which is a larger commitment than a
                // dialog and answers the same question.
                if (opensFinish) setFinishing(true);
                else if (advance || s === "AWAITING_PARTS") {
                  // Blocked always asks, forward or sideways — not to confirm
                  // the move but to collect the reason, which the report is
                  // refused without.
                  setWhy(blocker ?? "PARTS");
                  setWhyNote(s === "AWAITING_PARTS" ? (note ?? "") : "");
                  setConfirming(s);
                } else report(s);
              }}
              disabled={busy !== null || locked}
              aria-pressed={on}
              aria-disabled={locked}
              title={
                locked
                  ? `The repair is already ${stageLabel(stage).toLowerCase()} — a report only goes forward`
                  : opensFinish
                    ? `Finish the job — ${handover!.done} of ${handover!.required} photos filed`
                    : advance
                      ? `${meta.blurb} — asks before filing, because this cannot be undone`
                      : meta.blurb
              }
              className="stage-btn"
              data-on={on}
              data-opens={opensFinish}
              data-locked={locked}
              data-tone={meta.tone}
            >
              {loading ? (
                <Loader2 size={12} className="animate-spin" />
              ) : on ? (
                <Check size={12} strokeWidth={3} />
              ) : locked ? (
                <Lock size={10} strokeWidth={2.6} />
              ) : opensFinish ? (
                <Camera size={11} />
              ) : null}
              {label}
            </button>
          );
        })}
      </div>

      {/* The last step, as a step. Tapping it is the same as tapping Ready —
          two ways into one door, because "I have finished" and "let me file the
          photos" are the same intention arriving in different words. */}
      {handover && !handover.complete && handoverPairs && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFinishing(true);
          }}
          className="ho-prompt mt-2"
        >
          <span className="ho-prompt-glyph">
            <Camera size={13} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            Finished? Add the <b>{handover.required} handover photos</b>
            <span className="ho-prompt-sub">
              {handover.done > 0
                ? `${handover.done} of ${handover.required} filed — these become the listing`
                : "Shoot the repaired vehicle — these become the listing"}
            </span>
          </span>
          <span className="ho-prompt-rail" aria-hidden>
            {Array.from({ length: handover.required }).map((_, i) => (
              <span key={i} data-on={i < handover.done} />
            ))}
          </span>
        </button>
      )}

      {/* ---- The one question ----
          Asked only for a step FORWARD, and only because that step cannot be
          taken back. A sideways move between in-progress and awaiting-parts
          stays one tap: both directions are legal, so a dialog there would be
          a question with nothing at stake on the one screen whose whole design
          is that filing a report costs a single tap in a workshop.

          It names both ends — where the job is and where it is going — because
          the thing being confirmed is the MOVE, and an engineer who mis-tapped
          needs to see the stage they are leaving to notice. */}
      <Modal open={confirming !== null} onClose={() => setConfirming(null)} size="sm">
        {confirming && (
          <>
            <ModalHeader
              title={
                confirming === "AWAITING_PARTS"
                  ? "What is it waiting on?"
                  : `Mark ${REPAIR_STAGE_META[confirming].label.toLowerCase()}?`
              }
              subtitle={
                confirming === "AWAITING_PARTS"
                  ? "The work has stopped — say what stopped it"
                  : REPAIR_STAGE_META[confirming].blurb
              }
              onClose={() => setConfirming(null)}
              // The dialog head has no "ok" tone — a green confirmation
              // header would be congratulating a decision that has not been
              // taken yet. Ready falls back to the accent with the rest.
              tone={
                REPAIR_STAGE_META[confirming].tone === "warn" ? "warn" : "accent"
              }
            />
            <ModalBody>
              <p className="stage-confirm-move">
                <span className="stage-confirm-from">{stageLabel(at_)}</span>
                <ArrowRight size={13} className="shrink-0 text-ink-3" />
                <span className="stage-confirm-to">
                  {confirming === "AWAITING_PARTS"
                    ? BLOCKER_META[why].label
                    : REPAIR_STAGE_META[confirming].label}
                </span>
              </p>

              {/* ---- Why it stopped ----
                  Asked here rather than left to the note, because "how much of
                  the workshop is waiting on the parts desk" is a figure
                  somebody chases and it is only true if the stage means what
                  it says. Two choices; the second one has to say what. */}
              {confirming === "AWAITING_PARTS" ? (
                <div className="mt-3">
                  <div className="why-grid">
                    {BLOCKERS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setWhy(b)}
                        className="why-opt"
                        data-on={why === b}
                      >
                        <span className="why-opt-label">{BLOCKER_META[b].label}</span>
                        <span className="why-opt-blurb">{BLOCKER_META[b].blurb}</span>
                      </button>
                    ))}
                  </div>
                  <input
                    value={whyNote}
                    onChange={(e) => setWhyNote(e.target.value)}
                    maxLength={280}
                    placeholder={
                      why === "OTHER"
                        ? "What is holding it up?"
                        : "Which part, or when it is due (optional)"
                    }
                    className="field mt-2.5"
                    aria-label="Note"
                  />
                </div>
              ) : (
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-2">
                  A repair report only goes forward. Once this is filed you
                  cannot move it back — to correct it, file the stage the job is
                  actually at.
                </p>
              )}
            </ModalBody>
            <ModalFooter>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirming(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-gradient btn-sm"
                disabled={
                  busy !== null ||
                  // "Something else is wrong" is not a report.
                  (confirming === "AWAITING_PARTS" && why === "OTHER" && !whyNote.trim())
                }
                onClick={() => {
                  const next = confirming;
                  setConfirming(null);
                  report(next, whyNote, why);
                }}
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                {confirming === "AWAITING_PARTS"
                  ? `Mark ${BLOCKER_META[why].label.toLowerCase()}`
                  : `Mark ${REPAIR_STAGE_META[confirming].label.toLowerCase()}`}
              </button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {handoverPairs && (
        <FinishWorkModal
          open={finishing}
          onClose={() => setFinishing(false)}
          vehicleId={vehicleId}
          vehicleName={vehicleName ?? "This vehicle"}
          pairs={handoverPairs}
        />
      )}

      {/* The last note, so the engineer can see what they told everyone. */}
      {note && !noteOpen && (
        <p className="mt-2 text-[12px] leading-snug text-ink-2">
          <span className="text-ink-3">Note: </span>
          {note}
        </p>
      )}

      {/* Optional second step. Never in the way of filing the stage. */}
      {noteOpen ? (
        <div className="mt-2 flex items-start gap-1.5">
          <textarea
            autoFocus
            rows={2}
            maxLength={280}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            placeholder="What is holding it up, or what is left to do?"
            className="field flex-1 resize-none text-[13px]"
          />
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!draft.trim() || busy !== null}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Keep the current stage, attach the note to it.
                report(stage ?? "IN_PROGRESS", draft);
              }}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : "Save"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNoteOpen(false);
                setDraft("");
              }}
              aria-label="Cancel note"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDraft(note ?? "");
            setNoteOpen(true);
          }}
          className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3 transition-colors hover:text-accent"
        >
          <MessageSquarePlus size={12} />
          {note ? "Edit note" : "Add a note"}
        </button>
      )}
    </div>
  );
}

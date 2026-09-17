"use client";

import { ArrowRight, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

/**
 * The hand-off receipt.
 *
 * Every desk in this chain does the same thing: finishes a piece of work and
 * passes the file to the next desk. Until now that moment produced nothing at
 * all — the panel called `router.push("/dashboard")` and the vehicle simply
 * vanished. You were left to infer from the absence that it had worked, which
 * is the one thing a system should never make someone do with their own work.
 *
 * So this is deliberately a RECEIPT rather than a "Success!" banner. Three
 * things, in the order a person actually wants them:
 *
 *   1. Confirmation, with the figures you just committed printed back. A desk
 *      that approves Tk 3,20,000 wants to see Tk 3,20,000 in the confirmation,
 *      not a green tick. That is also the last cheap moment to catch a typo.
 *   2. Where it went. The app knows exactly which desk holds it next, and
 *      "who has it now" is the question people otherwise ask each other in
 *      person all afternoon.
 *   3. A thank-you, where one is genuinely earned — see the `thanks` prop.
 *
 * The perforated tear-edge under the facts is not decoration for its own
 * sake: it is the visual grammar of a docket being torn off and handed over,
 * which is precisely what just happened to the file.
 */

export interface HandoffFact {
  label: string;
  value: string;
  /** Pulls the eye to the number that matters most on the receipt. */
  strong?: boolean;
}

export function HandoffDialog({
  open,
  title,
  subject,
  facts = [],
  nextDesk,
  nextAction,
  thanks,
  continueLabel = "Back to dashboard",
  onContinue,
  tone = "ok",
}: {
  open: boolean;
  /** What just happened, in the past tense: "Assessment submitted". */
  title: string;
  /** The vehicle it happened to. */
  subject: string;
  /** The figures committed, printed back for a last look. */
  facts?: HandoffFact[];
  /** Who holds the file now. Omitted when the file did not move desks. */
  nextDesk?: string;
  /** What that desk will do with it. */
  nextAction?: string;
  /**
   * A thank-you, where one is earned.
   *
   * Deliberately optional and deliberately not written here. Thanking someone
   * for every keystroke is how a thank-you stops meaning anything — so it is
   * passed in only for the moments that genuinely close out a real piece of
   * work, and each one is worded for the specific thing that person did.
   */
  thanks?: string;
  continueLabel?: string;
  onContinue: () => void;
  tone?: "ok" | "accent";
}) {
  return (
    <Modal
      open={open}
      onClose={onContinue}
      variant="mobile"
      size="sm"
      labelledBy="handoff-title"
      closeOnBackdrop={false}
    >
      <div className="hoff" data-tone={tone}>
        <span className="hoff-mark" aria-hidden>
          <svg viewBox="0 0 52 52">
            <circle className="hoff-ring" cx="26" cy="26" r="23" />
            <path className="hoff-tick" d="M15 27 L23 34 L38 19" />
          </svg>
        </span>

        <h2 id="handoff-title" className="hoff-title">
          {title}
        </h2>
        <p className="hoff-subject">{subject}</p>

        {facts.length > 0 && (
          <div className="hoff-receipt">
            {facts.map((f) => (
              <div key={f.label} className="hoff-fact" data-strong={f.strong}>
                <span>{f.label}</span>
                <span>{f.value}</span>
              </div>
            ))}
            <span className="hoff-tear" aria-hidden />
          </div>
        )}

        {nextDesk && (
          <div className="hoff-next">
            <span className="hoff-next-label">Now with</span>
            <span className="hoff-next-desk">
              <ArrowRight size={13} />
              {nextDesk}
            </span>
            {nextAction && <span className="hoff-next-action">{nextAction}</span>}
          </div>
        )}

        {thanks && <p className="hoff-thanks">{thanks}</p>}

        <button className="btn btn-primary btn-block mt-4" onClick={onContinue} autoFocus>
          <Check size={15} />
          {continueLabel}
        </button>
      </div>
    </Modal>
  );
}

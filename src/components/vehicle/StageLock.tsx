import { Lock, RotateCcw, Hourglass } from "lucide-react";
import type { DeskLock } from "@/lib/stageLock";

/**
 * What a desk sees where its inputs used to be.
 *
 * Before this, a panel simply disappeared when the file moved on, which reads
 * as something broken rather than as something finished. A locked card says
 * three things instead: your part is done, who has it now, and what would put
 * it back in your hands.
 *
 * Nothing here enforces anything. The panel it replaces is already gated on
 * status, and the API re-checks status before it writes — this is the sign on
 * the door, not the lock.
 */
export function StageLock({ lock }: { lock: DeskLock }) {
  if (lock.state !== "locked" && lock.state !== "waiting") return null;

  const held = lock.state === "locked";

  return (
    <section className="stage-lock" data-state={lock.state}>
      <span className="stage-lock-icon">
        {held ? <Lock size={15} /> : <Hourglass size={15} />}
      </span>
      <div className="min-w-0">
        <h2 className="text-[13px] font-semibold leading-tight text-ink">{lock.headline}</h2>
        <p className="mt-1 text-[11.5px] leading-snug text-ink-2">{lock.detail}</p>
      </div>
    </section>
  );
}

/**
 * The banner on a panel that was sent back.
 *
 * Carries the reason the next desk gave. An engineer opening a file they have
 * already submitted once needs to know immediately that this is rework and
 * why — otherwise they re-submit the same estimate and it bounces again.
 */
export function ReworkBanner({ lock }: { lock: DeskLock }) {
  if (lock.state !== "reopened") return null;

  return (
    <div className="rework-banner">
      <RotateCcw size={15} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold leading-tight">{lock.headline}</p>
        <p className="mt-0.5 text-[11.5px] leading-snug opacity-90">{lock.detail}</p>
      </div>
    </div>
  );
}

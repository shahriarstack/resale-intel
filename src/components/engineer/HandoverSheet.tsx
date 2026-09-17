"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { sendJSON, uploadImage } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { ANGLES, ANGLE_BRIEF, ANGLE_LABEL, type Angle } from "@/lib/photos";

/**
 * The five photographs that close a repair.
 *
 * The angles are not arbitrary: they are the SAME five the ARO shot at
 * recovery, which are the five a listing is built from. That is what lets each
 * tile carry the recovery photograph as a small inset — the instruction is not
 * a sentence to read, it is "take this one again, now you have fixed it" — and
 * it means the workshop files a before-and-after of its own work on every
 * vehicle it touches, without anyone being asked to.
 *
 * Two ways in, because there are two ways people actually do this:
 *
 *   ALL FIVE AT ONCE  walk round the truck, shoot five, then pick them all in
 *     one go. They fill front → left → right → back → cabin in order. This is
 *     the fast path and it is the button that gets the emphasis.
 *
 *   ONE AT A TIME     tap a tile, shoot it, done. For a retake, or for someone
 *     working through it as they go.
 *
 * Every upload lands immediately. A workshop phone on a bad connection loses
 * one shot, not five, and a half-finished sheet can be walked away from and
 * come back to. Nothing here is a form with a Save button.
 */

export interface Pair {
  angle: Angle;
  before: string | null;
  after: string | null;
}

type TileState =
  | { kind: "idle" }
  | { kind: "busy"; preview: string }
  | { kind: "error"; preview: string };

// ---------------------------------------------------------------------------
// The grid — shared by the panel and the finish-work dialog
// ---------------------------------------------------------------------------

function useHandover(vehicleId: string, pairs: Pair[]) {
  const router = useRouter();
  const { toast } = useToast();
  const [work, setWork] = useState<Partial<Record<Angle, TileState>>>({});

  const missing = useMemo(() => pairs.filter((p) => !p.after).map((p) => p.angle), [pairs]);

  /** Upload one file and file it against one angle. */
  async function shoot(angle: Angle, file: File) {
    const preview = URL.createObjectURL(file);
    setWork((w) => ({ ...w, [angle]: { kind: "busy", preview } }));
    try {
      const { name } = await uploadImage(await compressImage(file));
      await sendJSON(`/api/vehicles/${vehicleId}/handover`, "POST", {
        shots: [{ angle, name }],
      });
      setWork((w) => ({ ...w, [angle]: { kind: "idle" } }));
      router.refresh();
    } catch (e) {
      setWork((w) => ({ ...w, [angle]: { kind: "error", preview } }));
      toast(e instanceof Error ? e.message : "Upload failed", "bad");
    }
  }

  /**
   * The fast path: a pile of photographs, assigned to whatever is still
   * missing, in order. Uploaded one at a time rather than in parallel — five
   * simultaneous multipart posts from a workshop phone is how you get five
   * timeouts instead of five photographs — but filed in ONE request at the
   * end, so the set either arrives or it does not.
   */
  async function shootMany(files: File[]) {
    const targets = missing.slice(0, files.length);
    if (targets.length === 0) return;

    const previews = files.map((f) => URL.createObjectURL(f));
    setWork((w) => {
      const next = { ...w };
      targets.forEach((a, i) => (next[a] = { kind: "busy", preview: previews[i] }));
      return next;
    });

    const shots: { angle: Angle; name: string }[] = [];
    for (const [i, angle] of targets.entries()) {
      try {
        const { name } = await uploadImage(await compressImage(files[i]));
        shots.push({ angle, name });
      } catch {
        setWork((w) => ({ ...w, [angle]: { kind: "error", preview: previews[i] } }));
      }
    }

    if (shots.length === 0) {
      toast("None of those uploaded — check the connection", "bad");
      return;
    }
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/handover`, "POST", { shots });
      setWork({});
      toast(`${shots.length} photo${shots.length === 1 ? "" : "s"} filed`, "ok");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not file those", "bad");
    }
  }

  async function clear(angle: Angle) {
    setWork((w) => ({ ...w, [angle]: { kind: "busy", preview: "" } }));
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/handover`, "POST", { remove: [angle] });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not clear that shot", "bad");
    } finally {
      setWork((w) => ({ ...w, [angle]: { kind: "idle" } }));
    }
  }

  return { work, missing, shoot, shootMany, clear };
}

export function HandoverGrid({
  vehicleId,
  pairs,
  readOnly = false,
}: {
  vehicleId: string;
  pairs: Pair[];
  readOnly?: boolean;
}) {
  const { work, missing, shoot, shootMany, clear } = useHandover(vehicleId, pairs);
  const bulk = useRef<HTMLInputElement>(null);
  const busy = Object.values(work).some((s) => s?.kind === "busy");

  return (
    <>
      {/* The fast path, given the weight. Most engineers will have walked round
          the vehicle with the camera already; this is the one tap that turns
          that into a filed set. */}
      {!readOnly && missing.length > 0 && (
        <>
          <button
            type="button"
            className="ho-bulk"
            onClick={() => bulk.current?.click()}
            disabled={busy}
          >
            <span className="ho-bulk-glyph">
              {busy ? <Loader2 size={18} className="animate-spin" /> : <ImagePlus size={18} />}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="ho-bulk-title">
                {busy
                  ? "Uploading…"
                  : missing.length === ANGLES.length
                    ? "Add all five at once"
                    : `Add the last ${missing.length}`}
              </span>
              <span className="ho-bulk-sub">
                Pick or shoot {missing.length} photo{missing.length === 1 ? "" : "s"} — they fill{" "}
                {missing.map((a) => ANGLE_LABEL[a].toLowerCase()).join(", ")} in order
              </span>
            </span>
          </button>
          <input
            ref={bulk}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) shootMany(files);
              e.target.value = "";
            }}
          />
        </>
      )}

      <div className="ho-grid">
        {pairs.map((p) => (
          <Tile
            key={p.angle}
            pair={p}
            state={work[p.angle] ?? { kind: "idle" }}
            isNext={p.angle === missing[0]}
            readOnly={readOnly}
            onShoot={shoot}
            onClear={clear}
          />
        ))}
      </div>
    </>
  );
}

function Tile({
  pair,
  state,
  isNext,
  readOnly,
  onShoot,
  onClear,
}: {
  pair: Pair;
  state: TileState;
  isNext: boolean;
  readOnly: boolean;
  onShoot: (a: Angle, f: File) => void;
  onClear: (a: Angle) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const busy = state.kind === "busy";
  const filled = !!pair.after;

  return (
    <div className="ho-tile" data-filled={filled} data-next={isNext && !filled}>
      <button
        type="button"
        className="ho-shot"
        onClick={() => !readOnly && !filled && input.current?.click()}
        disabled={busy || readOnly || filled}
        data-state={state.kind}
        aria-label={
          filled
            ? `${ANGLE_LABEL[pair.angle]} filed`
            : `Photograph the ${ANGLE_LABEL[pair.angle].toLowerCase()} — ${ANGLE_BRIEF[pair.angle]}`
        }
        title={ANGLE_BRIEF[pair.angle]}
      >
        {filled ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pair.after!} alt={`${ANGLE_LABEL[pair.angle]}, after repair`} loading="lazy" />
        ) : state.kind !== "idle" && state.preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.preview} alt="" className="opacity-40" />
            <span className="ho-overlay">
              {busy ? <Loader2 size={15} className="animate-spin" /> : "retry"}
            </span>
          </>
        ) : (
          <span className="ho-overlay">
            <Camera size={16} />
          </span>
        )}

        {/* What this angle looked like when it arrived. The whole reason a
            tile needs no instructions. */}
        {pair.before && !filled && (
          <span className="ho-before">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pair.before} alt="" loading="lazy" />
            <span>before</span>
          </span>
        )}

        {filled && (
          <span className="ho-done-pip">
            <Check size={10} strokeWidth={3.5} />
          </span>
        )}
      </button>

      <div className="ho-tile-foot">
        <span className="ho-tile-name">{ANGLE_LABEL[pair.angle]}</span>
        {filled && !readOnly && (
          <button
            type="button"
            className="ho-clear"
            onClick={() => onClear(pair.angle)}
            disabled={busy}
            aria-label={`Retake the ${ANGLE_LABEL[pair.angle].toLowerCase()} shot`}
            title="Retake"
          >
            {busy ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />}
          </button>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onShoot(pair.angle, f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The finish-work dialog
// ---------------------------------------------------------------------------

/**
 * What opens when the engineer says the work is done.
 *
 * The photographs used to be a separate panel and READY was simply refused
 * without them, which is a locked door with no handle. This is the same rule
 * expressed as a step: say you have finished, photograph what you finished,
 * submit. One action, in the order the work actually happens.
 */
export function FinishWorkModal({
  open,
  onClose,
  vehicleId,
  vehicleName,
  pairs,
}: {
  open: boolean;
  onClose: () => void;
  vehicleId: string;
  vehicleName: string;
  pairs: Pair[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const done = pairs.filter((p) => p.after).length;
  const complete = done === ANGLES.length;

  async function submit() {
    setSubmitting(true);
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/progress`, "POST", { stage: "READY" });
      toast("Marked ready for handover", "ok");
      onClose();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not mark it ready", "bad");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      variant="mobile"
      size="md"
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      labelledBy="finish-work-title"
    >
      <div className="ho-modal-head">
        <div className="min-w-0">
          <h2 id="finish-work-title" className="ho-modal-title">
            Finish the job
          </h2>
          <p className="ho-modal-sub">
            {vehicleName} · photograph the repaired vehicle
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon shrink-0"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      <div className="ho-modal-body">
        <div className="ho-rail">
          {pairs.map((p) => (
            <span key={p.angle} className="ho-seg" data-on={!!p.after} />
          ))}
        </div>
        <p className="ho-lead">
          {complete ? (
            <>
              All five filed. These become the marketplace listing, marked{" "}
              <b>after refurbishment</b>.
            </>
          ) : (
            <>
              <b>
                {done} of {ANGLES.length}
              </b>{" "}
              filed. Each tile shows how that angle looked when the vehicle arrived.
            </>
          )}
        </p>

        <HandoverGrid vehicleId={vehicleId} pairs={pairs} />
      </div>

      <div className="ho-modal-foot">
        {complete ? (
          <button className="btn btn-ok btn-block" onClick={submit} disabled={submitting}>
            {submitting ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Sparkles size={15} /> Submit &amp; mark ready
              </>
            )}
          </button>
        ) : (
          <button className="btn btn-primary btn-block" disabled>
            {ANGLES.length - done} more photo{ANGLES.length - done === 1 ? "" : "s"} to go
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// The panel on the vehicle record
// ---------------------------------------------------------------------------

/**
 * The same set, as a panel on the vehicle page.
 *
 * The dialog is where this normally gets done. This exists for the engineer
 * who opens the record to check what they filed, and for a retake after the
 * job is already marked ready.
 */
export function HandoverSheet({
  vehicleId,
  pairs,
  readOnly = false,
}: {
  vehicleId: string;
  pairs: Pair[];
  readOnly?: boolean;
}) {
  const done = pairs.filter((p) => p.after).length;
  const complete = done === ANGLES.length;

  return (
    <section className="action-panel p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink">Handover photos</h2>
          <p className="text-xs text-ink-2">
            Five shots of the finished vehicle. These become the marketplace listing.
          </p>
        </div>
        <span className="ho-count" data-done={complete}>
          {complete ? <Check size={12} strokeWidth={3} /> : null}
          {done}/{ANGLES.length}
        </span>
      </div>

      <div className="ho-rail">
        {pairs.map((p) => (
          <span key={p.angle} className="ho-seg" data-on={!!p.after} />
        ))}
      </div>

      <p className="ho-lead mt-3">
        {readOnly
          ? "This vehicle has moved on. The set is kept as the record of how it left the workshop."
          : complete
            ? "All five filed. The listing will use these instead of the recovery photos."
            : "Each tile shows how that angle looked when the vehicle arrived."}
      </p>

      <div className="mt-3">
        <HandoverGrid vehicleId={vehicleId} pairs={pairs} readOnly={readOnly} />
      </div>
    </section>
  );
}

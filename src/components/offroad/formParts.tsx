"use client";

import { useRef } from "react";
import { Camera, Check, Loader2, X, AlertCircle } from "lucide-react";

/**
 * The form furniture shared by the three new intakes.
 *
 * Lifted out rather than copied because the capture form's own Section/Field
 * pair had already been copied once by the time the third intake needed them,
 * and three private copies of a numbered section heading is how two of them
 * end up a pixel apart.
 */

export function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card-lg p-5">
      <h2 className="flex items-center gap-2.5 font-display text-lg font-bold text-ink">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft font-mono text-xs text-accent">
          {n}
        </span>
        {title}
      </h2>
      {hint && <p className="mb-4 mt-1.5 pl-8.5 text-[12.5px] leading-snug text-ink-3">{hint}</p>}
      <div className={`space-y-4 ${hint ? "" : "mt-4"}`}>{children}</div>
    </section>
  );
}

export function Field({
  label,
  optional,
  hint,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="label mb-1.5 flex items-center gap-2">
        {label}
        {optional && (
          <span className="font-sans text-[9px] normal-case tracking-normal text-ink-3">
            optional
          </span>
        )}
      </div>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}

/**
 * A single-choice row of cards.
 *
 * Used for accident severity, vehicle condition and the custody reason — all
 * three of which are short lists where the option's meaning is not obvious
 * from its name alone. A native select would hide the hints; radio buttons on
 * a phone are a target too small to hit while standing next to a wreck.
 */
export function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  columns = 2,
}: {
  options: { value: T; label: string; hint?: string; tone?: string }[];
  value: T | "";
  onChange: (v: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={`grid gap-2 ${columns === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
      {options.map((o) => {
        const on = value === o.value;
        const tone = o.tone ?? "var(--accent)";
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            className="rounded-lg border p-2.5 text-left transition-colors"
            style={{
              borderColor: on ? tone : "var(--rule)",
              background: on ? `color-mix(in srgb, ${tone} 9%, var(--surface))` : "var(--surface)",
            }}
          >
            <span
              className="block text-[13px] font-semibold leading-tight"
              style={{ color: on ? tone : "var(--ink)" }}
            >
              {o.label}
            </span>
            {o.hint && (
              <span className="mt-0.5 block text-[10.5px] leading-snug text-ink-3">{o.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function YesNo({
  value,
  onChange,
  yesLabel = "Yes",
  noLabel = "No",
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-rule-strong">
      {([true, false] as const).map((v, i) => {
        const active = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`flex-1 px-3.5 py-2 text-xs font-semibold transition-colors ${
              i === 0 ? "border-r border-rule-strong" : ""
            }`}
            style={
              active
                ? { background: v ? "var(--ok)" : "var(--bad)", color: "#fff" }
                : { background: "var(--surface)", color: "var(--ink-3)" }
            }
          >
            {v ? yesLabel : noLabel}
          </button>
        );
      })}
    </div>
  );
}

export interface CasePhoto {
  id: string;
  status: "busy" | "done" | "error";
  preview: string;
  name?: string;
  caption: string;
}

/**
 * Free-form photo strip.
 *
 * Unlike the capture form's fixed five angles, an off-road case is
 * photographed wherever the story is — so this is an add-as-many-as-you-need
 * grid with an optional caption on each, rather than a set of labelled slots
 * that would mostly go unfilled.
 */
export function PhotoStrip({
  photos,
  onAdd,
  onRemove,
  onCaption,
  max = 8,
}: {
  photos: CasePhoto[];
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
  onCaption: (id: string, caption: string) => void;
  max?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          for (const f of files.slice(0, max - photos.length)) onAdd(f);
          e.target.value = "";
        }}
      />

      <div className="grid grid-cols-3 gap-2.5">
        {photos.map((p) => (
          <div key={p.id} className="relative">
            <div
              className="relative aspect-square overflow-hidden rounded-lg border"
              style={{ borderColor: p.status === "error" ? "var(--bad)" : "var(--rule-strong)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" className="h-full w-full object-cover" />
              {p.status === "busy" && (
                <span className="absolute inset-0 grid place-items-center bg-black/45">
                  <Loader2 size={18} className="animate-spin text-white" />
                </span>
              )}
              {p.status === "done" && (
                <span
                  className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full"
                  style={{ background: "var(--ok)", color: "#fff" }}
                >
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              {p.status === "error" && (
                <span className="absolute inset-0 grid place-items-center bg-bad/70 text-white">
                  <AlertCircle size={18} />
                </span>
              )}
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                aria-label="Remove photo"
                className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/55 text-white"
              >
                <X size={12} />
              </button>
            </div>
            <input
              className="field mt-1 !py-1 text-[11px]"
              placeholder="Caption…"
              value={p.caption}
              onChange={(e) => onCaption(p.id, e.target.value)}
              maxLength={160}
            />
          </div>
        ))}

        {photos.length < max && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border-2 border-dashed transition-colors hover:bg-surface-2"
            style={{ borderColor: "var(--rule-strong)", color: "var(--ink-3)" }}
          >
            <span className="flex flex-col items-center gap-1">
              <Camera size={20} strokeWidth={1.7} />
              <span className="text-[10.5px] font-semibold">Add photo</span>
            </span>
          </button>
        )}
      </div>
      <p className="mt-1.5 font-mono text-[10.5px] text-ink-3">
        {photos.length} of {max} · tap a tile to caption it
      </p>
    </div>
  );
}

/** The completion bar every intake shares. */
export function ProgressCard({ progress }: { progress: number }) {
  return (
    <div
      className="mb-6 rounded-xl border border-rule bg-surface-2 p-4"
      style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.05s both" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-ink-2">Form completion</span>
        <span
          className="font-mono text-sm font-semibold tnum"
          style={{ color: progress === 100 ? "var(--ok)" : "var(--accent)" }}
        >
          {progress}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className="progress-bar-fill"
          style={{
            width: `${progress}%`,
            background: progress === 100 ? "var(--ok)" : "var(--accent)",
            transition: "width 0.3s ease, background 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

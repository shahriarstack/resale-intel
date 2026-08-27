"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
} from "lucide-react";
import { getJSON, sendJSON, uploadImage } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { useToast } from "@/components/ui/Toast";

type Slot = "LEFT" | "RIGHT" | "FRONT" | "BACK" | "CABIN" | "SLEEP";
const BASE_SLOTS: Slot[] = ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN"];

interface Options {
  territories: { id: string; name: string }[];
  locations: { id: string; name: string; type: string }[];
  questions: { id: string; key: string; label: string; requiresNote: boolean }[];
  engineers: { id: string; name: string; staffId: string }[];
}

interface PhotoState {
  status: "idle" | "busy" | "done" | "error";
  preview?: string;
  name?: string;
}

const LETTER_OPTIONS = [
  { value: "NONE", label: "No letter yet" },
  { value: "LETTER_1", label: "Letter 1" },
  { value: "LETTER_2", label: "Letter 2" },
  { value: "LETTER_3", label: "Letter 3 (locks record)" },
  { value: "WRITTEN", label: "Written (locks record)" },
];

export default function CapturePage() {
  const router = useRouter();
  const { toast } = useToast();
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    customerName: "",
    customerCode: "",
    make: "",
    model: "",
    year: "",
    mileage: "",
    registrationNo: "",
    territoryId: "",
    currentLocationId: "",
    capturedLocation: "",
    remarks: "",
    hasSleeperCabin: false,
    letterStage: "NONE",
    assignedEngineerId: "",
  });

  const [photos, setPhotos] = useState<Record<Slot, PhotoState>>({
    LEFT: { status: "idle" },
    RIGHT: { status: "idle" },
    FRONT: { status: "idle" },
    BACK: { status: "idle" },
    CABIN: { status: "idle" },
    SLEEP: { status: "idle" },
  });

  const [answers, setAnswers] = useState<Record<string, { answer: boolean; note: string }>>({});

  useEffect(() => {
    getJSON<Options>("/api/capture/options")
      .then(setOptions)
      .catch((e) => setOptionsError(e.message));
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const slots: Slot[] = form.hasSleeperCabin ? [...BASE_SLOTS, "SLEEP"] : BASE_SLOTS;

  const progress = useMemo(() => {
    let filled = 0;
    let total = 0;
    total += 3; // regNo, customerName, territoryId
    if (form.registrationNo.trim()) filled++;
    if (form.customerName.trim()) filled++;
    if (form.territoryId) filled++;
    total += 1; // location
    if (form.currentLocationId) filled++;
    total += 1; // engineer
    if (form.assignedEngineerId) filled++;
    total += slots.length; // photos
    slots.forEach((s) => { if (photos[s].status === "done") filled++; });
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  }, [form, photos, slots]);

  const handlePhoto = async (slot: Slot, file: File) => {
    const preview = URL.createObjectURL(file);
    setPhotos((p) => ({ ...p, [slot]: { status: "busy", preview } }));
    try {
      const compressed = await compressImage(file);
      const { name } = await uploadImage(compressed);
      setPhotos((p) => ({ ...p, [slot]: { status: "done", preview, name } }));
    } catch {
      setPhotos((p) => ({ ...p, [slot]: { status: "error", preview } }));
      toast("Photo upload failed. Tap to retry.", "bad");
    }
  };

  const clearPhoto = (slot: Slot) =>
    setPhotos((p) => ({ ...p, [slot]: { status: "idle" } }));

  const toggleAnswer = (qid: string, answer: boolean) =>
    setAnswers((a) => ({ ...a, [qid]: { answer, note: a[qid]?.note ?? "" } }));

  const setNote = (qid: string, note: string) =>
    setAnswers((a) => ({ ...a, [qid]: { answer: a[qid]?.answer ?? false, note } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const missing = slots.filter((s) => photos[s].status !== "done");
    if (missing.length) {
      setError(`Please add and finish uploading: ${missing.join(", ")}`);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      return;
    }
    if (photos.LEFT.status === "busy") return;

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        year: form.year ? Number(form.year) : null,
        photos: slots.map((s) => ({ slot: s, name: photos[s].name! })),
        answers: (options?.questions ?? []).map((q) => ({
          questionId: q.id,
          answer: answers[q.id]?.answer ?? false,
          note: answers[q.id]?.note ?? "",
        })),
      };
      await sendJSON("/api/vehicles", "POST", payload);
      setDone(true);
      toast("Vehicle captured successfully");
      setTimeout(() => router.push("/dashboard"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
      toast(err instanceof Error ? err.message : "Capture failed", "bad");
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 text-center">
        <div className="flex flex-col items-center" style={{ animation: "scaleIn 0.3s ease" }}>
          <div className="grid h-20 w-20 place-items-center rounded-full bg-ok-soft text-ok" style={{ animation: "pulse-subtle 1.5s ease infinite" }}>
            <CheckCircle2 size={44} strokeWidth={1.8} />
          </div>
          <h2 className="page-title mt-6 text-3xl">Vehicle captured</h2>
          <p className="mt-2 text-[15px] text-ink-2">Added to your pipeline. Taking you back…</p>
        </div>
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center" style={{ animation: "fadeIn 0.2s ease" }}>
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-bad-soft">
          <AlertCircle className="text-bad" size={32} />
        </div>
        <p className="mt-4 text-sm font-medium text-ink-2">{optionsError}</p>
        <button className="btn btn-ghost mt-4" onClick={() => window.location.reload()}>
          Retry
        </button>
      </div>
    );
  }

  if (!options) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-accent" size={26} />
          <span className="text-sm text-ink-3">Loading capture form…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-7 sm:px-6">
      <header className="mb-7" style={{ animation: "fadeIn 0.2s ease" }}>
        <div className="eyebrow text-accent">New capture</div>
        <h1 className="page-title mt-1.5 text-[30px]">Capture a vehicle</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          All fields are required unless marked optional.
        </p>
      </header>

      {/* Progress bar */}
      <div className="mb-6 rounded-xl border border-rule bg-surface-2 p-4" style={{ animation: "slideUp 0.2s ease 0.05s both" }}>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink-2">Form completion</span>
          <span className="font-mono text-sm font-semibold tnum" style={{ color: progress === 100 ? "var(--ok)" : "var(--accent)" }}>
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

      <form onSubmit={submit} className="space-y-6">
        {/* 1 — Vehicle & customer */}
        <div style={{ animation: "slideUp 0.2s ease 0.06s both" }}>
          <Section n={1} title="Vehicle & customer">
            <Field label="Registration number">
              <input
                className="field font-mono uppercase"
                value={form.registrationNo}
                onChange={(e) => set("registrationNo", e.target.value)}
                placeholder="DHA-11-2233"
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer name">
                <input className="field" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required />
              </Field>
              <Field label="Customer code" optional>
                <input className="field" value={form.customerCode} onChange={(e) => set("customerCode", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Make" optional>
                <input className="field" value={form.make} onChange={(e) => set("make", e.target.value)} placeholder="Foton" />
              </Field>
              <Field label="Model" optional>
                <input className="field" value={form.model} onChange={(e) => set("model", e.target.value)} placeholder="Aumark S" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mfg. year" optional>
                <input className="field" type="number" inputMode="numeric" value={form.year} onChange={(e) => set("year", e.target.value)} placeholder="2021" />
              </Field>
              <Field label="Mileage (km)" optional>
                <input className="field" value={form.mileage} onChange={(e) => set("mileage", e.target.value)} placeholder="45000" />
              </Field>
            </div>
          </Section>
        </div>

        {/* 2 — Documentation checklist */}
        {options.questions.length > 0 && (
          <div style={{ animation: "slideUp 0.2s ease 0.09s both" }}>
            <Section n={2} title="Documentation">
              <div className="space-y-2.5">
                {options.questions.map((q) => {
                  const a = answers[q.id];
                  return (
                    <div key={q.id} className="rounded-lg border border-rule bg-surface-2 p-3 transition-colors hover:border-rule-strong">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-ink">{q.label}</span>
                        <YesNo value={a?.answer} onChange={(v) => toggleAnswer(q.id, v)} />
                      </div>
                      {q.requiresNote && a?.answer === false && (
                        <input
                          className="field mt-2.5 text-sm"
                          placeholder="Add a note…"
                          value={a?.note ?? ""}
                          onChange={(e) => setNote(q.id, e.target.value)}
                          style={{ animation: "slideDown 0.15s ease" }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {/* 3 — Placement */}
        <div style={{ animation: "slideUp 0.2s ease 0.12s both" }}>
          <Section n={3} title="Placement">
            <Field label="Sales territory">
              <select className="field" value={form.territoryId} onChange={(e) => set("territoryId", e.target.value)} required>
                <option value="">Select territory…</option>
                {options.territories.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Current location">
              <select className="field" value={form.currentLocationId} onChange={(e) => set("currentLocationId", e.target.value)} required>
                <option value="">Select location…</option>
                {options.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Captured location" optional>
              <input className="field" value={form.capturedLocation} onChange={(e) => set("capturedLocation", e.target.value)} placeholder="Where the vehicle was seized" />
            </Field>
          </Section>
        </div>

        {/* 4 — Condition & photos */}
        <div style={{ animation: "slideUp 0.2s ease 0.15s both" }}>
          <Section n={4} title="Condition & photos">
            <Field label="Remarks" optional>
              <textarea
                className="field resize-none"
                rows={3}
                value={form.remarks}
                onChange={(e) => set("remarks", e.target.value)}
                placeholder="Dents, missing parts, engine notes…"
              />
            </Field>

            <label className="flex items-center gap-3 rounded-lg border border-rule bg-surface-2 p-3.5 transition-colors hover:border-rule-strong">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[var(--accent)]"
                checked={form.hasSleeperCabin}
                onChange={(e) => set("hasSleeperCabin", e.target.checked)}
              />
              <span className="text-sm font-medium text-ink">
                This vehicle has a sleeper cabin
                <span className="block text-xs font-normal text-ink-3">Adds a required sleeper photo</span>
              </span>
            </label>

            <div>
              <div className="label mb-2 flex items-center gap-2">
                Photos · minimum 5
                <span className="count-badge text-[10px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  {slots.filter((s) => photos[s].status === "done").length}/{slots.length}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                {slots.map((slot) => (
                  <PhotoTile key={slot} slot={slot} state={photos[slot]} onPick={handlePhoto} onClear={clearPhoto} />
                ))}
              </div>
            </div>
          </Section>
        </div>

        {/* 5 — Letter & assignment */}
        <div style={{ animation: "slideUp 0.2s ease 0.18s both" }}>
          <Section n={5} title="Letter & assignment">
            <Field label="Letter status">
              <select className="field" value={form.letterStage} onChange={(e) => set("letterStage", e.target.value)}>
                {LETTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Assign service engineer">
              <select className="field" value={form.assignedEngineerId} onChange={(e) => set("assignedEngineerId", e.target.value)} required>
                <option value="">Select engineer…</option>
                {options.engineers.map((eng) => (
                  <option key={eng.id} value={eng.id}>{eng.name} · {eng.staffId}</option>
                ))}
              </select>
              {options.engineers.length === 0 && (
                <p className="mt-1.5 text-xs text-warn">No service engineers found. Ask an admin to add one.</p>
              )}
            </Field>
          </Section>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-bad" style={{ animation: "scaleIn 0.15s ease" }}>
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        <div className="sticky bottom-20 z-10 pt-1">
          <button type="submit" disabled={submitting} className="btn btn-primary btn-block py-3.5 shadow-card-md">
            {submitting ? (
              <>
                <Loader2 size={18} className="animate-spin" /> Submitting…
              </>
            ) : (
              <>
                Submit capture <Check size={18} />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card-lg p-5">
      <h2 className="mb-4 flex items-center gap-2.5 font-display text-lg font-bold text-ink">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft font-mono text-xs text-accent">
          {n}
        </span>
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1.5 flex items-center gap-2">
        {label}
        {optional && <span className="font-sans text-[9px] normal-case tracking-normal text-ink-3">optional</span>}
      </div>
      {children}
    </div>
  );
}

function YesNo({ value, onChange }: { value: boolean | undefined; onChange: (v: boolean) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-rule-strong">
      {([true, false] as const).map((v, i) => {
        const active = value === v;
        return (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className={`px-3.5 py-1.5 text-xs font-semibold transition-colors ${i === 0 ? "border-r border-rule-strong" : ""}`}
            style={
              active
                ? { background: v ? "var(--ok)" : "var(--bad)", color: "#fff" }
                : { background: "var(--surface)", color: "var(--ink-3)" }
            }
          >
            {v ? "Yes" : "No"}
          </button>
        );
      })}
    </div>
  );
}

function PhotoTile({
  slot,
  state,
  onPick,
  onClear,
}: {
  slot: Slot;
  state: PhotoState;
  onPick: (slot: Slot, file: File) => void;
  onClear: (slot: Slot) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filled = state.status === "done" || state.status === "busy" || state.status === "error";

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(slot, f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative grid aspect-square w-full place-items-center overflow-hidden rounded-xl border-2 border-dashed border-rule-strong bg-surface-2 transition-[border-color,transform] duration-150 active:scale-[0.98]"
        style={filled ? { borderStyle: "solid", borderColor: state.status === "done" ? "var(--ok)" : "var(--rule)" } : undefined}
      >
        {state.preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.preview} alt={slot} width={320} height={320} className="h-full w-full object-cover" />
            {state.status === "busy" && (
              <div className="absolute inset-0 grid place-items-center bg-black/45">
                <Loader2 size={20} className="animate-spin text-white" />
              </div>
            )}
            {state.status === "done" && (
              <div className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ok text-white" style={{ animation: "scaleIn 0.2s ease" }}>
                <Check size={12} strokeWidth={3} />
              </div>
            )}
            {state.status === "error" && (
              <div className="absolute inset-0 grid place-items-center bg-bad/70 text-[11px] font-semibold text-white">
                Retry
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-ink-3">
            <Camera size={22} />
            <span className="text-[11px] font-semibold tracking-wide">{slot}</span>
          </div>
        )}
      </button>
      {filled && state.status !== "busy" && (
        <button
          type="button"
          onClick={() => onClear(slot)}
          aria-label={`Remove ${slot} photo`}
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ink text-white shadow"
        >
          <X size={12} strokeWidth={3} />
        </button>
      )}
      <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-ink-3">{slot}</div>
    </div>
  );
}

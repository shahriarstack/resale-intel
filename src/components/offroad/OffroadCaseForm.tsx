"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { OffroadKind } from "@prisma/client";
import { AlertCircle, CarFront, CheckCircle2, Landmark, Loader2 } from "lucide-react";
import { getJSON, sendJSON, uploadImage } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { NumberField } from "@/components/ui/NumberField";
import { useToast } from "@/components/ui/Toast";
import {
  Section,
  Field,
  ChoiceCards,
  PhotoStrip,
  ProgressCard,
  type CasePhoto,
} from "@/components/offroad/formParts";
import {
  ACCIDENT_SEVERITY_META,
  CUSTODY_CONDITION_META,
  OFFROAD_KIND_META,
  THANA_REASON_META,
} from "@/lib/offroad";

interface Options {
  territories: { id: string; name: string }[];
  /** The patch this officer is based in, preselected below. */
  baseTerritoryId: string | null;
  brands: { id: string; name: string; models: { id: string; name: string }[] }[];
}

/**
 * One form, two kinds of off-road case.
 *
 * Accident and Thana ask the same eight questions about identity and the clock
 * and then diverge for three or four fields each. Two separate pages would
 * have been two copies of the identity section, the photo strip, the progress
 * arithmetic and the submit handler — so the divergence is a branch inside one
 * form rather than a second form that starts out identical and drifts.
 */
export function OffroadCaseForm({ kind }: { kind: OffroadKind }) {
  const router = useRouter();
  const { toast } = useToast();
  const isAccident = kind === "ACCIDENT";
  const meta = OFFROAD_KIND_META[kind];

  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [photos, setPhotos] = useState<CasePhoto[]>([]);

  const [form, setForm] = useState({
    registrationNo: "",
    customerCode: "",
    customerName: "",
    brandId: "",
    modelId: "",
    mileage: "",
    occurredAt: today(),
    approxDays: "",
    remarks: "",
    territoryId: "",
    // The account position. Optional — see the schema note on OffroadCase.
    odNumber: "",
    odAmount: "",
    outstandingAmount: "",
    // Accident
    accidentSeverity: "" as "" | "MINOR" | "MODERATE" | "MAJOR" | "TOTAL_LOSS",
    accidentNote: "",
    // Thana
    vehicleCondition: "" as "" | "ON_ROAD" | "OFF_ROAD",
    thanaReason: "" as "" | keyof typeof THANA_REASON_META,
    thanaReasonNote: "",
    thanaName: "",
    vehicleLocation: "",
  });

  useEffect(() => {
    getJSON<Options>("/api/capture/options")
      .then((o) => {
        setOptions(o);
        // Preselect the patch they are based in. The list only holds their own
        // territories now, so a blank default would mean "one of these two" —
        // which is not an answer anybody intended to give.
        if (o.baseTerritoryId) {
          setForm((f) => (f.territoryId ? f : { ...f, territoryId: o.baseTerritoryId! }));
        }
      })
      .catch((e) => setOptionsError(e.message));
  }, []);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const setBrand = (brandId: string) => setForm((f) => ({ ...f, brandId, modelId: "" }));

  const models = useMemo(
    () => options?.brands.find((b) => b.id === form.brandId)?.models ?? [],
    [options, form.brandId],
  );

  // ---- Photos --------------------------------------------------------------
  const addPhoto = async (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preview = URL.createObjectURL(file);
    setPhotos((p) => [...p, { id, status: "busy", preview, caption: "" }]);
    try {
      const compressed = await compressImage(file);
      const { name } = await uploadImage(compressed);
      setPhotos((p) => p.map((x) => (x.id === id ? { ...x, status: "done", name } : x)));
    } catch {
      setPhotos((p) => p.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
      toast("Photo upload failed. Remove it and try again.", "bad");
    }
  };

  const removePhoto = (id: string) => setPhotos((p) => p.filter((x) => x.id !== id));
  const captionPhoto = (id: string, caption: string) =>
    setPhotos((p) => p.map((x) => (x.id === id ? { ...x, caption } : x)));

  // ---- Completion ----------------------------------------------------------
  const outstanding = useMemo(() => {
    const missing: string[] = [];
    const need = (ok: boolean, label: string) => {
      if (!ok) missing.push(label);
    };
    need(!!form.registrationNo.trim(), "Registration number");
    need(!!form.customerCode.trim(), "Customer ID");
    need(!!form.customerName.trim(), "Customer name");
    need(!!form.brandId, "Brand");
    need(!!form.modelId, "Model");
    need(!!form.mileage.trim(), "Mileage");
    need(!!form.occurredAt, isAccident ? "Accident date" : "Date");
    need(form.approxDays.trim() !== "" && Number(form.approxDays) > 0, "Estimated days");
    need(!!form.remarks.trim(), "Remarks");

    // Shared by both kinds. The account position is no longer optional: the
    // desk ranks cases against each other by exposure, and a case with none on
    // it sorts as though nothing is riding on the vehicle.
    need(!!form.territoryId, "Territory");
    need(form.odNumber.trim() !== "", "Current OD #");
    need(form.odAmount.trim() !== "", "Overdue amount");
    need(form.outstandingAmount.trim() !== "", "Outstanding amount");
    need(photos.some((p) => p.status === "done"), "At least one photo");

    if (isAccident) {
      need(!!form.accidentSeverity, "Accident condition");
      need(!!form.accidentNote.trim(), "Damage description");
    } else {
      need(!!form.vehicleCondition, "Vehicle condition");
      need(!!form.thanaReason, "Reason");
      need(!!form.thanaReasonNote.trim(), "Reason description");
      need(!!form.thanaName.trim(), "Thana name");
      need(!!form.vehicleLocation.trim(), "Vehicle location");
    }
    return missing;
  }, [form, photos, isAccident]);

  // Every field on the form, counted per kind. Accident: the eleven shared
  // answers plus severity and the damage note. Thana: the same eleven plus
  // condition, reason, its description, the station and where it is held.
  const totalRequired = isAccident ? 13 : 16;
  const progress = Math.round(
    ((totalRequired - Math.min(outstanding.length, totalRequired)) / totalRequired) * 100,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (outstanding.length) {
      const shown = outstanding.slice(0, 4).join(", ");
      const rest = outstanding.length - 4;
      setError(`Still needed: ${shown}${rest > 0 ? `, and ${rest} more` : ""}.`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (photos.some((p) => p.status === "busy")) {
      setError("Wait for the photos to finish uploading.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        kind,
        registrationNo: form.registrationNo,
        customerCode: form.customerCode,
        customerName: form.customerName,
        brandId: form.brandId,
        modelId: form.modelId,
        mileage: form.mileage,
        occurredAt: form.occurredAt,
        approxDays: Number(form.approxDays),
        remarks: form.remarks,
        territoryId: form.territoryId,
        // Required now, and the check above refuses a blank before this runs.
        // Still sent as null rather than 0 when empty, so a payload that
        // somehow gets here is rejected by the schema instead of arriving as
        // "this customer owes nothing".
        odNumber: form.odNumber.trim() === "" ? null : Number(form.odNumber),
        odAmount: form.odAmount.trim() === "" ? null : Number(form.odAmount),
        outstandingAmount:
          form.outstandingAmount.trim() === "" ? null : Number(form.outstandingAmount),
        photos: photos
          .filter((p) => p.status === "done")
          .map((p) => ({ name: p.name!, caption: p.caption })),
        ...(isAccident
          ? {
              accidentSeverity: form.accidentSeverity,
              accidentNote: form.accidentNote,
            }
          : {
              vehicleCondition: form.vehicleCondition,
              thanaReason: form.thanaReason,
              thanaReasonNote: form.thanaReasonNote,
              thanaName: form.thanaName,
              vehicleLocation: form.vehicleLocation,
            }),
      };
      await sendJSON("/api/offroad", "POST", payload);
      setDone(true);
      toast(`${meta.label} case opened`);
      setTimeout(() => router.push("/dashboard"), 1600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not open the case";
      setError(message);
      toast(message, "bad");
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="grid min-h-[70vh] place-items-center px-6 text-center">
        <div className="flex flex-col items-center" style={{ animation: "scaleIn 0.3s var(--ease-spring)" }}>
          <div
            className="grid h-20 w-20 place-items-center rounded-full bg-ok-soft text-ok-ink"
            style={{ animation: "pulse-subtle 1.5s ease infinite" }}
          >
            <CheckCircle2 size={44} strokeWidth={1.8} />
          </div>
          <h2 className="page-title mt-6 text-3xl">Case opened</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            The countdown has started. Taking you back…
          </p>
        </div>
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 text-center">
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
          <span className="text-sm text-ink-3">Loading…</span>
        </div>
      </div>
    );
  }

  const tone = isAccident ? "var(--warn)" : "var(--bad)";

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-6">
      <header className="mb-6" style={{ animation: "fadeIn 0.2s var(--ease-standard)" }}>
        <div className="eyebrow" style={{ color: tone }}>
          Off-road · not a capture
        </div>
        <h1 className="page-title mt-1.5 text-[30px]">
          {isAccident ? "Log an accident" : "Log a custody case"}
        </h1>
        <p className="mt-1.5 text-sm text-ink-2">{meta.blurb}</p>
      </header>

      <ProgressCard progress={progress} />

      {error && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-[13px] font-medium text-bad-ink">
          <AlertCircle size={15} className="mt-px shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Section n={1} title="Vehicle & customer">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer ID">
              <input
                className="field font-mono uppercase"
                value={form.customerCode}
                onChange={(e) => set("customerCode", e.target.value)}
                placeholder="CUS-0142"
              />
            </Field>
            <Field label="Customer name">
              <input
                className="field"
                value={form.customerName}
                onChange={(e) => set("customerName", e.target.value)}
              />
            </Field>
          </div>
          <Field label="Registration number">
            <input
              className="field font-mono uppercase"
              value={form.registrationNo}
              onChange={(e) => set("registrationNo", e.target.value)}
              placeholder="DHA-11-2233"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <select className="field" value={form.brandId} onChange={(e) => setBrand(e.target.value)}>
                <option value="">Select brand…</option>
                {options.brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Model">
              <select
                className="field"
                value={form.modelId}
                disabled={!form.brandId}
                onChange={(e) => set("modelId", e.target.value)}
              >
                <option value="">{form.brandId ? "Select model…" : "Pick a brand first"}</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mileage" hint="N/A if the odometer cannot be read.">
              <input
                className="field font-mono"
                value={form.mileage}
                onChange={(e) => set("mileage", e.target.value)}
                placeholder="84,500 km"
              />
            </Field>
            <Field label="Territory">
              <select
                className="field"
                value={form.territoryId}
                onChange={(e) => set("territoryId", e.target.value)}
              >
              {/* Their own patches, and nothing else — base first, then
                  anything they are covering. `/api/capture/options` decides
                  the list; all three intake forms render the same one. */}
              {options.territories.length !== 1 && (
                <option value="">Select territory…</option>
              )}
              {options.territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
              </select>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                {options.territories.length === 0
                  ? "No territory is assigned to you — ask HQ."
                  : options.territories.length === 1
                    ? "Your territory."
                    : `Yours, and ${options.territories.length - 1} you are covering.`}
              </p>
            </Field>
          </div>

          {/* ---- The account position ----
              Optional, unlike on a capture request: that form is filled at a
              desk with the statement open, this one at a roadside. Left blank
              the case still opens — but a case that carries these is one the
              desk can rank against every other case by what is riding on it,
              so they are asked for rather than left out. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Current OD #" hint="Instalments overdue.">
              <NumberField
                className="field font-mono tnum"
                value={form.odNumber}
                onChange={(v) => set("odNumber", v)}
                placeholder="—"
              />
            </Field>
            <Field label="Overdue amount (Tk)">
              <NumberField
                className="field font-mono tnum"
                value={form.odAmount}
                onChange={(v) => set("odAmount", v)}
                placeholder="—"
              />
            </Field>
            <Field label="Outstanding (Tk)" hint="Total still owed.">
              <NumberField
                className="field font-mono tnum"
                value={form.outstandingAmount}
                onChange={(v) => set("outstandingAmount", v)}
                placeholder="—"
              />
            </Field>
          </div>
        </Section>

        {isAccident ? (
          <Section n={2} title="What happened">
            <Field label="Accident condition">
              <ChoiceCards
                value={form.accidentSeverity}
                onChange={(v) => set("accidentSeverity", v)}
                options={(
                  ["MINOR", "MODERATE", "MAJOR", "TOTAL_LOSS"] as const
                ).map((k) => ({
                  value: k,
                  label: ACCIDENT_SEVERITY_META[k].label,
                  hint: ACCIDENT_SEVERITY_META[k].hint,
                  tone:
                    ACCIDENT_SEVERITY_META[k].tone === "ok"
                      ? "var(--ok)"
                      : ACCIDENT_SEVERITY_META[k].tone === "warn"
                        ? "var(--warn)"
                        : "var(--bad)",
                }))}
              />
            </Field>
            <Field label="Damage description" hint="What is actually broken — the engineer reads this.">
              <textarea
                className="field resize-none"
                rows={3}
                value={form.accidentNote}
                onChange={(e) => set("accidentNote", e.target.value)}
                maxLength={2000}
                placeholder="Front-left chassis rail bent, cab mounting cracked, radiator burst…"
              />
            </Field>
          </Section>
        ) : (
          <Section n={2} title="Why it is being held">
            <Field
              label="Vehicle condition"
              hint="Will it drive out of the compound when it is released?"
            >
              <ChoiceCards
                value={form.vehicleCondition}
                onChange={(v) => set("vehicleCondition", v)}
                options={(["ON_ROAD", "OFF_ROAD"] as const).map((k) => ({
                  value: k,
                  label: CUSTODY_CONDITION_META[k].label,
                  hint: CUSTODY_CONDITION_META[k].hint,
                  tone: CUSTODY_CONDITION_META[k].tone === "ok" ? "var(--ok)" : "var(--warn)",
                }))}
              />
            </Field>
            <Field label="Reason">
              <ChoiceCards
                value={form.thanaReason}
                onChange={(v) => set("thanaReason", v)}
                options={(
                  ["ACCIDENT", "DRUG_CASE", "ILLEGAL_GOODS", "THEFT", "CUSTOMS", "OTHER"] as const
                ).map((k) => ({
                  value: k,
                  label: THANA_REASON_META[k].label,
                  hint: THANA_REASON_META[k].hint,
                  tone: "var(--bad)",
                }))}
              />
            </Field>
            <Field
              label="Case detail"
              optional={false}
              hint="Case or GD number, what was found, who filed it."
            >
              <textarea
                className="field resize-none"
                rows={3}
                value={form.thanaReasonNote}
                onChange={(e) => set("thanaReasonNote", e.target.value)}
                maxLength={2000}
                placeholder="GD 442/26, seized at the Ashulia checkpoint…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Thana / police station">
                <input
                  className="field"
                  value={form.thanaName}
                  onChange={(e) => set("thanaName", e.target.value)}
                  placeholder="Ashulia Thana"
                />
              </Field>
              <Field label="Vehicle is held at">
                <input
                  className="field"
                  value={form.vehicleLocation}
                  onChange={(e) => set("vehicleLocation", e.target.value)}
                  placeholder="Thana compound, Savar"
                />
              </Field>
            </div>
          </Section>
        )}

        <Section
          n={3}
          title={meta.clockLabel}
          hint="The countdown runs from this date for this many days. Your manager can extend it later; the original estimate stays on record."
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label={isAccident ? "Accident date" : "Date seized"}>
              <input
                type="date"
                className="field font-mono"
                value={form.occurredAt}
                max={today()}
                onChange={(e) => set("occurredAt", e.target.value)}
              />
            </Field>
            <Field label={isAccident ? "Approx. repair days" : "Approx. days to clear"}>
              <input
                type="number"
                min={1}
                max={730}
                className="field font-mono tnum"
                value={form.approxDays}
                onChange={(e) => set("approxDays", e.target.value)}
                placeholder={isAccident ? "14" : "45"}
              />
            </Field>
          </div>
          {form.occurredAt && Number(form.approxDays) > 0 && (
            <div className="rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] text-ink-2">
              Expected back by{" "}
              <strong style={{ color: tone }}>
                {dueDateLabel(form.occurredAt, Number(form.approxDays))}
              </strong>
            </div>
          )}
        </Section>

        <Section
          n={4}
          title="Photos & remarks"
          hint={
            isAccident
              ? "At least one photograph showing the condition is required."
              : "Photograph the vehicle and any paperwork you were given."
          }
        >
          <Field label="Photos">
            <PhotoStrip
              photos={photos}
              onAdd={addPhoto}
              onRemove={removePhoto}
              onCaption={captionPhoto}
            />
          </Field>
          <Field label="Remarks">
            <textarea
              className="field resize-none"
              rows={3}
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              maxLength={2000}
              placeholder="Anything the desk should know…"
            />
          </Field>
        </Section>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <>
              {isAccident ? <CarFront size={16} /> : <Landmark size={16} />}
              Open {meta.label.toLowerCase()} case
            </>
          )}
        </button>
        <div aria-hidden className="h-10" />
      </form>
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dueDateLabel(from: string, days: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

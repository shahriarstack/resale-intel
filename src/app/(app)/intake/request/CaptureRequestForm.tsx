"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileClock, Loader2 } from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { NumberField } from "@/components/ui/NumberField";
import { useToast } from "@/components/ui/Toast";
import { Section, Field, YesNo, ProgressCard } from "@/components/offroad/formParts";
import { taka } from "@/lib/format";

interface Options {
  territories: { id: string; name: string }[];
  /** The patch this officer is based in, preselected below. */
  baseTerritoryId: string | null;
  brands: { id: string; name: string; models: { id: string; name: string }[] }[];
}

/**
 * Ask the Recovery Manager to pre-approve a seizure.
 *
 * Short on purpose. The vehicle is still on the road, so everything that
 * describes a vehicle IN OUR POSSESSION — photographs, the document checklist,
 * an engineer, a yard — is absent and belongs on the capture form that runs
 * after approval. What is here is the account position and the officer's read
 * on what the capture will actually achieve, because those two things are the
 * entire basis on which the decision gets made.
 */
export default function CaptureRequestForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    registrationNo: "",
    customerCode: "",
    customerName: "",
    brandId: "",
    modelId: "",
    odNumber: "",
    odAmount: "",
    outstandingAmount: "",
    settlementPossible: undefined as boolean | undefined,
    remarks: "",
    territoryId: "",
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

  const outstanding = useMemo(() => {
    const missing: string[] = [];
    const need = (ok: boolean, label: string) => {
      if (!ok) missing.push(label);
    };
    need(!!form.registrationNo.trim(), "Registration number");
    need(!!form.customerCode.trim(), "Customer code");
    need(!!form.customerName.trim(), "Customer name");
    need(form.odNumber.trim() !== "", "Current OD #");
    need(form.odAmount.trim() !== "", "Current OD amount");
    need(form.outstandingAmount.trim() !== "", "Outstanding amount");
    need(!!form.brandId, "Brand");
    need(!!form.modelId, "Model");
    need(!!form.territoryId, "Territory");
    need(form.settlementPossible !== undefined, "Expected outcome");
    need(!!form.remarks.trim(), "Remarks");
    return missing;
  }, [form]);

  // Eleven required answers — every field on the form. Nothing here is
  // optional any more: a request the manager has to rule on with gaps in it is
  // a request that gets ruled on twice.
  const REQUIRED = 11;
  const progress = useMemo(
    () => Math.round(((REQUIRED - outstanding.length) / REQUIRED) * 100),
    [outstanding],
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

    setSubmitting(true);
    try {
      await sendJSON("/api/capture-requests", "POST", {
        ...form,
        odNumber: Number(form.odNumber),
        odAmount: Number(form.odAmount),
        outstandingAmount: Number(form.outstandingAmount),
      });
      setDone(true);
      toast("Capture request sent for approval");
      setTimeout(() => router.push("/dashboard"), 1600);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send the request";
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
          <h2 className="page-title mt-6 text-3xl">Request sent</h2>
          <p className="mt-2 text-[15px] text-ink-2">
            Waiting on Recovery Operations HQ. You&apos;ll see it under Requests.
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

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-6">
      <header className="mb-6" style={{ animation: "fadeIn 0.2s var(--ease-standard)" }}>
        <div className="eyebrow" style={{ color: "#6a5acd" }}>
          Pre-approval
        </div>
        <h1 className="page-title mt-1.5 text-[30px]">Capture request</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          The manager rules on this before you take the vehicle. Nothing here creates a file —
          you complete the capture form afterwards.
        </p>
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
          <Field label="Registration number">
            <input
              className="field font-mono uppercase"
              value={form.registrationNo}
              onChange={(e) => set("registrationNo", e.target.value)}
              placeholder="DHA-11-2233"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer code">
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
        </Section>

        <Section
          n={2}
          title="Account position"
          hint="A snapshot as it stands today. The approval is recorded against these figures, so they are kept even if the account moves afterwards."
        >
          <Field label="Current OD #" hint="How many instalments are overdue.">
            <NumberField
              className="field font-mono tnum"
              value={form.odNumber}
              onChange={(v) => set("odNumber", v)}
              placeholder="6"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Current OD amount">
              <NumberField
                className="field font-mono tnum"
                value={form.odAmount}
                onChange={(v) => set("odAmount", v)}
                placeholder="0"
              />
            </Field>
            <Field label="Outstanding amount">
              <NumberField
                className="field font-mono tnum"
                value={form.outstandingAmount}
                onChange={(v) => set("outstandingAmount", v)}
                placeholder="0"
              />
            </Field>
          </div>

          {(form.odAmount || form.outstandingAmount) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 font-mono text-[12px] tnum text-ink-2">
              {form.odAmount && <span>Overdue {taka(Number(form.odAmount))}</span>}
              {form.outstandingAmount && (
                <span style={{ color: "var(--bad)" }}>
                  Outstanding {taka(Number(form.outstandingAmount))}
                </span>
              )}
            </div>
          )}
        </Section>

        <Section
          n={3}
          title="What happens after the capture?"
          hint="Both answers still mean taking the vehicle — that is what you are asking for. This says what you expect the capture to achieve. Recorded for information only; it does not decide the approval."
        >
          <Field label="Once the vehicle is captured, do you expect the customer to clear the dues?">
            <YesNo
              value={form.settlementPossible}
              onChange={(v) => set("settlementPossible", v)}
              yesLabel="Likely to settle"
              noLabel="Unlikely to settle"
            />
            {/* The two readings spelled out, because the Yes/No alone reads as
                "should we capture" — which is not the question. */}
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              <OutcomeNote
                on={form.settlementPossible === true}
                tone="var(--ok)"
                title="Likely to settle"
                body="The capture is the pressure. Expect the customer to pay up and the vehicle to go back to them."
              />
              <OutcomeNote
                on={form.settlementPossible === false}
                tone="var(--warn)"
                title="Unlikely to settle"
                body="No further payment expected, and little chance they hand it over willingly. Plan for a Credit Note and resale."
              />
            </div>
          </Field>
          <Field label="Remarks" hint="What you have tried, what the customer says, why now.">
            <textarea
              className="field resize-none"
              rows={4}
              value={form.remarks}
              onChange={(e) => set("remarks", e.target.value)}
              maxLength={2000}
              placeholder="Three visits since March, customer unreachable since the last promise to pay…"
            />
          </Field>
        </Section>

        <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
          {submitting ? (
            <Loader2 size={17} className="animate-spin" />
          ) : (
            <>
              <FileClock size={16} /> Send for approval
            </>
          )}
        </button>
        <div aria-hidden className="h-10" />
      </form>
    </div>
  );
}

/**
 * One of the two readings of the outcome question, shown side by side.
 *
 * Both are always visible and the chosen one lights up, rather than only
 * showing the selected explanation. The officer is picking between two
 * futures, and they can only pick well if both are on screen at once.
 */
function OutcomeNote({
  on,
  tone,
  title,
  body,
}: {
  on: boolean;
  tone: string;
  title: string;
  body: string;
}) {
  return (
    <div
      className="rounded-lg border px-3 py-2 transition-colors"
      style={{
        borderColor: on ? tone : "var(--rule)",
        background: on ? `color-mix(in srgb, ${tone} 8%, var(--surface))` : "var(--surface)",
        opacity: on ? 1 : 0.55,
      }}
    >
      <div
        className="text-[12px] font-bold leading-tight"
        style={{ color: on ? tone : "var(--ink-2)" }}
      >
        {title}
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-ink-3">{body}</p>
    </div>
  );
}

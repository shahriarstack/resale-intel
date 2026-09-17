"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Camera,
  Check,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
  FileClock,
  ShieldAlert,
  ShieldCheck,
  Unlock,
} from "lucide-react";
import { getJSON, sendJSON, uploadImage } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { NumberField } from "@/components/ui/NumberField";
import { useToast } from "@/components/ui/Toast";

type Slot =
  | "LEFT"
  | "RIGHT"
  | "FRONT"
  | "BACK"
  | "CABIN"
  | "CAPTURE_FORM"
  | "REMARKS";

// The five angles, fixed. The sleeper shot is gone: it was gated behind a
// checkbox nobody could answer reliably from outside the cab, and a photo set
// whose size depends on a self-reported flag is a photo set that never matches
// between two vehicles.
const BASE_SLOTS: Slot[] = ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN"];

// Human labels. Four angles are self-explanatory; the other three are not.
// "Cabin inside" in particular — "Cabin" was being read as another exterior
// shot of the cab, which is already covered by front and left.
const SLOT_LABEL: Record<Slot, string> = {
  LEFT: "Left",
  RIGHT: "Right",
  FRONT: "Front",
  BACK: "Back",
  CABIN: "Cabin inside",
  CAPTURE_FORM: "Signed form",
  REMARKS: "Remarks photo",
};

// How the vehicle was found. Three states, because an ARO can answer these
// without deliberating and every one of them changes what the engineer should
// expect to find.
const CONDITIONS = [
  { value: "ON_ROAD", label: "On-road", hint: "Drove, or could have driven, off site" },
  { value: "OFF_ROAD", label: "Off-road", hint: "Immobile but undamaged" },
  { value: "ACCIDENT", label: "Accident", hint: "Recovered damaged" },
];

// Where the case slip sits in the documentation run. It is a first-class field
// rather than a checklist question, but it is ASKED in the middle of the
// checklist, so it is slotted in by sort order like everything else.
const CASE_SLIP_ORDER = 5;

// The answer that means the odometer could not be read, rather than that the
// ARO skipped the field.
const MILEAGE_NA = "N/A";

interface Options {
  territories: { id: string; name: string }[];
  /** The patch this officer is based in, preselected below. */
  baseTerritoryId: string | null;
  locations: { id: string; name: string; type: string }[];
  questions: { id: string; key: string; label: string; requiresNote: boolean; sortOrder: number }[];
  engineers: { id: string; name: string; staffId: string }[];
  brands: { id: string; name: string; models: { id: string; name: string }[] }[];
}

interface PhotoState {
  status: "idle" | "busy" | "done" | "error";
  preview?: string;
  name?: string;
}

/** An open direct-capture window, as `/api/capture/window` reports it. */
interface CaptureWindowInfo {
  id: string;
  reason: string;
  closesAt: string;
  openedByName: string;
  maxCaptures: number | null;
  used: number;
  remaining: number | null;
}

/** Today, as the value a `<input type="date">` expects. */
function today(): string {
  const d = new Date();
  // Built from local parts, not toISOString(): the latter converts to UTC
  // first, which in Dhaka (UTC+6) yields yesterday's date for the first six
  // hours of every day — so a capture entered at 4am would default to, and be
  // capped at, the wrong day.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The floor the server also enforces — see `captureDate` in validation.ts. */
function yearsAgoISO(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "12 Aug 2026" — unambiguous where a date input's own rendering is not. */
function longDateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** How long the window has left. Mirrors `timeLeftLabel` in lib/captureWindow. */
function timeLeftLabel(closesAt: string): string {
  const ms = new Date(closesAt).getTime() - Date.now();
  if (ms <= 0) return "closing now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `${Math.max(1, hours)} ${hours === 1 ? "hour" : "hours"} left`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}


/**
 * The capture form, reached three ways.
 *
 * Straight from the intake chooser, from an APPROVED capture request, or from
 * an off-road case that has just been converted. The last two arrive with a
 * query parameter and pre-fill the identity fields from the record that sent
 * them — the officer already gave those facts once, and asking again is both
 * an invitation to typo them and the reason the two records would stop
 * matching.
 *
 * Everything else on the form is still asked. Photographs, the checklist and
 * the engineer are facts about a vehicle IN HAND, and no earlier record can
 * have known them.
 */
function CaptureForm() {
  const router = useRouter();
  const params = useSearchParams();
  const requestId = params.get("requestId");
  const caseId = params.get("caseId");
  // What we came from, for the banner. Null when this is a direct capture.
  const [origin, setOrigin] = useState<
    | null
    | { kind: "request"; registrationNo: string; customerName: string }
    | { kind: "case"; registrationNo: string; customerName: string; noc: string | null }
  >(null);
  // The admin authorisation, when this is a direct entry made during an open
  // window. `undefined` means the question has not been answered yet, which is
  // different from `null` — the gate below must not refuse an officer before
  // it knows whether a window is open for them.
  const [window_, setWindow] = useState<CaptureWindowInfo | null | undefined>(undefined);
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
    mileage: "",
    condition: "",
    territoryId: "",
    currentLocationId: "",
    currentLocationOther: "",
    remarks: "",
    hasCaseSlip: undefined as boolean | undefined,
    caseSlipFine: "",
    captureCost: "",
    assignedEngineerId: "",
    // Defaults to today, which is what it is for nearly every capture. The
    // field exists for the ones it is not: a seizure taken on Friday and typed
    // up on Monday, and the whole of a backfill window, where every vehicle
    // being entered went off the road weeks ago.
    captureDate: today(),
  });

  const [photos, setPhotos] = useState<Record<Slot, PhotoState>>({
    LEFT: { status: "idle" },
    RIGHT: { status: "idle" },
    FRONT: { status: "idle" },
    BACK: { status: "idle" },
    CABIN: { status: "idle" },
    CAPTURE_FORM: { status: "idle" },
    REMARKS: { status: "idle" },
  });

  // "Other" in the location list swaps the select for a text box. Held apart
  // from the form so clearing it cannot leave a stale typed value behind a
  // re-picked list entry.
  const [locationOther, setLocationOther] = useState(false);

  const [answers, setAnswers] = useState<Record<string, { answer: boolean; note: string }>>({});

  useEffect(() => {
    getJSON<Options>("/api/capture/options")
      .then((o) => {
        setOptions(o);
        // Preselect the patch they are based in — right almost every time, and
        // still one tap to change when the seizure was on a covered one.
        // Guarded on the field being untouched so this cannot overwrite a
        // choice made while the request was in flight.
        if (o.baseTerritoryId) {
          setForm((f) => (f.territoryId ? f : { ...f, territoryId: o.baseTerritoryId! }));
        }
      })
      .catch((e) => setOptionsError(e.message));
  }, []);

  // Only asked when there is nothing else authorising this capture. A form
  // opened off an approved request has its authority already and does not need
  // to know whether a window happens to be open as well — in that case the
  // state simply stays `undefined`, which nothing reads, because every site
  // that consumes it is already behind a `!requestId && !caseId` check.
  const needsWindow = !requestId && !caseId;
  useEffect(() => {
    if (!needsWindow) return;
    let cancelled = false;
    getJSON<{ open: boolean } & Partial<CaptureWindowInfo>>("/api/capture/window")
      .then((w) => {
        if (!cancelled) setWindow(w.open ? (w as CaptureWindowInfo) : null);
      })
      .catch(() => {
        // A window that cannot be confirmed is a window the officer does not
        // have. The submit would be refused anyway, so failing closed here
        // shows the refusal with its "raise a request" way out rather than a
        // form that dead-ends.
        if (!cancelled) setWindow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsWindow]);

  // Pre-fill from the approved request or converted case that sent us here.
  //
  // Brand and model are matched by NAME against the master list rather than
  // carried as ids: the origin record stored the resolved names (that is what
  // makes the pick list enforced), so this maps them back to whatever the ids
  // are today. A brand since deactivated simply does not match, and the
  // officer picks again — which is the correct outcome, not a bug.
  useEffect(() => {
    if (!options) return;
    if (!requestId && !caseId) return;

    const url = requestId ? `/api/capture-requests/${requestId}` : `/api/offroad/${caseId}`;
    getJSON<{
      registrationNo: string;
      customerCode: string;
      customerName: string;
      make: string | null;
      model: string | null;
      mileage?: string | null;
      nocReference?: string | null;
      territoryId?: string | null;
    }>(url)
      .then((r) => {
        const brand = options.brands.find((b) => b.name === r.make);
        const model = brand?.models.find((m) => m.name === r.model);
        setForm((f) => ({
          ...f,
          registrationNo: r.registrationNo,
          customerCode: r.customerCode,
          customerName: r.customerName,
          brandId: brand?.id ?? "",
          modelId: model?.id ?? "",
          mileage: r.mileage ?? f.mileage,
          territoryId: r.territoryId ?? f.territoryId,
        }));
        setOrigin(
          requestId
            ? { kind: "request", registrationNo: r.registrationNo, customerName: r.customerName }
            : {
                kind: "case",
                registrationNo: r.registrationNo,
                customerName: r.customerName,
                noc: r.nocReference ?? null,
              },
        );
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load the source record"));
  }, [options, requestId, caseId]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Changing brand clears the model in the same update. Left to a separate
  // effect, the form would briefly hold a model belonging to the previous
  // brand — which the server rejects.
  const setBrand = (brandId: string) =>
    setForm((f) => ({ ...f, brandId, modelId: "" }));

  const models = useMemo(
    () => options?.brands.find((b) => b.id === form.brandId)?.models ?? [],
    [options, form.brandId],
  );

  const slots: Slot[] = BASE_SLOTS;

  // The checklist, split around the case slip so the whole documentation run
  // reads in one order: papers, insurance, case slip, keys.
  const beforeCaseSlip = useMemo(
    () => (options?.questions ?? []).filter((q) => q.sortOrder < CASE_SLIP_ORDER),
    [options],
  );
  const afterCaseSlip = useMemo(
    () => (options?.questions ?? []).filter((q) => q.sortOrder >= CASE_SLIP_ORDER),
    [options],
  );

  /**
   * What is still outstanding, named.
   *
   * One list, used for both the progress ring and the error shown on submit,
   * so the bar can never read 100% while the button refuses. On a form this
   * long the useful message is not "something is missing" but which things —
   * so the submit handler prints the same names the ring is counting.
   */
  const outstanding = useMemo(() => {
    const missing: string[] = [];
    const need = (ok: boolean, label: string) => {
      if (!ok) missing.push(label);
    };

    need(!!form.registrationNo.trim(), "Registration number");
    need(!!form.customerCode.trim(), "Customer code");
    need(!!form.customerName.trim(), "Customer name");
    need(!!form.brandId, "Brand");
    need(!!form.modelId, "Model");
    need(!!form.mileage.trim(), "Mileage");
    need(!!form.condition, "Vehicle condition");
    need(form.hasCaseSlip !== undefined, "Case slip answer");
    need(
      form.hasCaseSlip !== true || form.caseSlipFine.trim() !== "",
      "Fine amount",
    );
    for (const q of options?.questions ?? []) {
      const a = answers[q.id];
      need(a?.answer !== undefined, q.label);
      // A question that exists to capture an exception is not answered until
      // the exception is described.
      if (q.requiresNote && a?.answer === false) {
        need(!!a?.note?.trim(), `${q.label} — note`);
      }
    }
    need(!!form.territoryId, "Sales territory");
    need(
      locationOther ? !!form.currentLocationOther.trim() : !!form.currentLocationId,
      "Current location",
    );
    need(!!form.remarks.trim(), "Remarks");
    for (const sl of slots) {
      need(photos[sl].status === "done", `${SLOT_LABEL[sl]} photo`);
    }
    need(photos.CAPTURE_FORM.status === "done", "Signed form photo");
    need(!!form.assignedEngineerId, "Service engineer");
    // What the seizure cost, and the photograph of the written remarks. Both
    // were the last optional things on this form; nothing on it is optional
    // now. Zero is a legitimate capture cost and is not the same as blank,
    // which is why the test is on the field being answered rather than on the
    // figure being non-zero.
    need(form.captureCost.trim() !== "", "Capture cost");
    need(photos.REMARKS.status === "done", "Remarks photo");

    return missing;
  }, [form, photos, slots, answers, options, locationOther]);

  // Counted from the same list, so the ring and the button always agree.
  const totalRequired = useMemo(() => {
    const questionFields = (options?.questions ?? []).reduce(
      (n, q) => n + 1 + (q.requiresNote && answers[q.id]?.answer === false ? 1 : 0),
      0,
    );
    // 13 named fields + the checklist + the angles + the fine when it applies.
    // Thirteen rather than eleven: the capture cost and the remarks photo were
    // the last two optional things on the form and are now counted like the
    // rest.
    return 13 + questionFields + slots.length + (form.hasCaseSlip === true ? 1 : 0);
  }, [options, answers, slots, form.hasCaseSlip]);

  const progress = useMemo(() => {
    const filled = Math.max(0, totalRequired - outstanding.length);
    return totalRequired > 0 ? Math.round((filled / totalRequired) * 100) : 0;
  }, [totalRequired, outstanding]);

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

    if (outstanding.length) {
      // Five is where a list stops being a checklist and starts being a wall.
      const shown = outstanding.slice(0, 5).join(", ");
      const rest = outstanding.length - 5;
      setError(
        `Still needed: ${shown}${rest > 0 ? `, and ${rest} more` : ""}.`,
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (Object.values(photos).some((p) => p.status === "busy")) {
      setError("Wait for the photos to finish uploading.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...form,
        // Carried through so the server can verify the approval, stamp the
        // vehicle's provenance and close the origin record in one transaction.
        captureRequestId: requestId ?? "",
        offroadCaseId: caseId ?? "",
        // Exactly one of the two reaches the server; the other is blanked so a
        // value typed and then abandoned cannot be sent alongside a picked one.
        currentLocationId: locationOther ? "" : form.currentLocationId,
        currentLocationOther: locationOther ? form.currentLocationOther : "",
        photos: [
          ...slots.map((s) => ({ slot: s, name: photos[s].name! })),
          { slot: "CAPTURE_FORM" as const, name: photos.CAPTURE_FORM.name! },
          // Required like the rest; the check above refuses a submit without
          // it. Still written conditionally so a payload that reaches here
          // without one is short a photo rather than carrying `undefined` as a
          // stored filename.
          ...(photos.REMARKS.status === "done"
            ? [{ slot: "REMARKS" as const, name: photos.REMARKS.name! }]
            : []),
        ],
        // Sent as answered rather than coerced: `outstanding` has already
        // established it is not undefined.
        hasCaseSlip: form.hasCaseSlip === true,
        caseSlipFine:
          form.hasCaseSlip === true && form.caseSlipFine !== "" ? form.caseSlipFine : null,
        captureCost: form.captureCost.trim() === "" ? null : form.captureCost,
        captureDate: form.captureDate,
        answers: (options?.questions ?? []).map((q) => ({
          questionId: q.id,
          // Not `?? false`. Every question has been answered by this point, and
          // defaulting an unanswered one to "no" is how a missing answer became
          // a recorded fact.
          answer: answers[q.id]!.answer,
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
        <div className="flex flex-col items-center" style={{ animation: "scaleIn 0.3s var(--ease-spring)" }}>
          <div className="grid h-20 w-20 place-items-center rounded-full bg-ok-soft text-ok-ink" style={{ animation: "pulse-subtle 1.5s ease infinite" }}>
            <CheckCircle2 size={44} strokeWidth={1.8} />
          </div>
          <h2 className="page-title mt-6 text-3xl">Vehicle captured</h2>
          <p className="mt-2 text-[15px] text-ink-2">Added to your pipeline. Taking you back…</p>
        </div>
      </div>
    );
  }

  // ---- The gate ----------------------------------------------------------
  //
  // There is no such thing as a capture from nowhere. The form only opens
  // against an approved request or a converted off-road case, and reaching it
  // without one is a dead end with a way out rather than a form that fills in
  // and then fails on submit.
  // Still asking whether a window is open. Showing the refusal here and then
  // replacing it a moment later would tell the officer they cannot do the thing
  // they are about to be allowed to do.
  if (!requestId && !caseId && window_ === undefined) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-6">
        <Loader2 size={22} className="animate-spin text-ink-3" />
      </div>
    );
  }

  if (!requestId && !caseId && !window_) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-14 text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
          style={{
            background: "color-mix(in srgb, #6d28d9 12%, var(--surface))",
            color: "#6d28d9",
          }}
        >
          <ShieldAlert size={26} />
        </div>
        <h1 className="page-title mt-4 text-[24px]">Approval first</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">
          A vehicle cannot be captured straight from this form. Raise a capture request so the
          Recovery Operations HQ can rule on the account position — once it is approved, the request
          opens this form with the details already filled in.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-3">
          An accident or custody case that has been converted to a capture also opens it, with
          its NOC on record.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <Link href="/intake/request" className="btn btn-primary btn-block">
            <FileClock size={16} /> Raise a capture request
          </Link>
          <Link href="/captures" className="btn btn-ghost btn-block">
            See my approved requests
          </Link>
        </div>
      </div>
    );
  }

  if (optionsError) {
    return (
      <div className="mx-auto w-full max-w-md px-5 py-16 text-center" style={{ animation: "fadeIn 0.2s var(--ease-standard)" }}>
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
    <div className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-6">
      <header className="mb-7" style={{ animation: "fadeIn 0.2s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">New capture</div>
        <h1 className="page-title mt-1.5 text-[30px]">Capture a vehicle</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          Every field on this form is required.
        </p>
      </header>

      {/* The exception, stated plainly on the form that uses it.
          Ochre rather than the calm indigo of an approved request: this record
          is being made outside the normal gate, the officer should know that
          while they make it, and the window's own reason is repeated here so
          nobody has to remember what they were told this morning. */}
      {window_ && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3"
          style={{ borderColor: "var(--warn-line)", background: "var(--grad-tint-warn)" }}
        >
          <span className="mt-0.5 shrink-0" style={{ color: "var(--warn-ink)" }}>
            <Unlock size={17} />
          </span>
          <div className="text-[12.5px] leading-snug" style={{ color: "var(--warn-ink)" }}>
            <strong>Direct entry — no capture request</strong>
            <div className="mt-1">
              {window_.openedByName} opened a window for this: “{window_.reason}”
            </div>
            <div className="mt-1 font-mono text-[11px]">
              {timeLeftLabel(window_.closesAt)}
              {window_.remaining !== null ? ` · ${window_.remaining} of ${window_.maxCaptures} left` : ""}
            </div>
            <div className="mt-1.5">
              Set the real date the vehicle was seized below. The file will be marked as
              entered without an approval.
            </div>
          </div>
        </div>
      )}

      {origin && (
        <div
          className="mb-5 flex items-start gap-2.5 rounded-xl border px-3.5 py-3"
          style={
            origin.kind === "request"
              ? { borderColor: "#6a5acd", background: "color-mix(in srgb, #6a5acd 8%, var(--surface))" }
              : { borderColor: "var(--bad)", background: "var(--bad-soft)" }
          }
        >
          <span
            className="mt-0.5 shrink-0"
            style={{ color: origin.kind === "request" ? "#6a5acd" : "var(--bad)" }}
          >
            {origin.kind === "request" ? <FileClock size={17} /> : <ShieldCheck size={17} />}
          </span>
          <div className="text-[12.5px] leading-snug text-ink-2">
            <strong className="text-ink">
              {origin.kind === "request"
                ? "Capturing against an approved request"
                : "Converting an off-road case"}
            </strong>
            <div className="mt-0.5 font-mono text-[11px] text-ink-3">
              {origin.registrationNo} · {origin.customerName}
              {origin.kind === "case" && origin.noc ? ` · NOC ${origin.noc}` : ""}
            </div>
            <div className="mt-1">
              Identity has been carried over. Everything below describes the vehicle now that
              it is in your hands, so it still has to be filled in.
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <div className="mb-6 rounded-xl border border-rule bg-surface-2 p-4" style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.05s both" }}>
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
        <div style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.06s both" }}>
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
            {/* Code before name: the ARO reads the customer code off the
                paperwork first, and it is what they search the account by. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Customer code">
                <input
                  className="field font-mono uppercase"
                  required
                  value={form.customerCode}
                  onChange={(e) => set("customerCode", e.target.value)}
                  placeholder="CUS-0142"
                />
              </Field>
              <Field label="Customer name">
                <input className="field" value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required />
              </Field>
            </div>
            {/* Brand and model come from Master data, so spelling stays
                consistent across the fleet and the register can group by it. */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Brand">
                <select
                  className="field"
                  required
                  value={form.brandId}
                  onChange={(e) => setBrand(e.target.value)}
                >
                  <option value="">Select brand…</option>
                  {options.brands.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Model">
                <select
                  className="field"
                  required
                  value={form.modelId}
                  onChange={(e) => set("modelId", e.target.value)}
                  disabled={!form.brandId}
                >
                  <option value="">
                    {form.brandId ? "Select model…" : "Choose a brand first"}
                  </option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                {form.brandId && models.length === 0 && (
                  <p className="mt-1.5 text-xs text-warn">
                    No models listed for this brand. Ask an admin to add them.
                  </p>
                )}
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mileage (km)">
                {/* An odometer can be broken, disconnected or simply
                    unreadable in the dark. N/A is a real answer and it has its
                    own control, so it can never be confused with a field the
                    ARO skipped. */}
                <div className="mileage-row">
                  {/* Safe to group here: "not available" lives in the chip
                      beside it, so this box only ever holds an odometer
                      reading. The offroad form's mileage field is plain text
                      because there the officer types N/A into the box itself. */}
                  <NumberField
                    className="field"
                    required
                    value={form.mileage === MILEAGE_NA ? "" : form.mileage}
                    disabled={form.mileage === MILEAGE_NA}
                    onChange={(v) => set("mileage", v)}
                    placeholder={form.mileage === MILEAGE_NA ? "Not available" : "45,000"}
                  />
                  <button
                    type="button"
                    className="na-chip"
                    data-on={form.mileage === MILEAGE_NA}
                    aria-pressed={form.mileage === MILEAGE_NA}
                    onClick={() =>
                      set("mileage", form.mileage === MILEAGE_NA ? "" : MILEAGE_NA)
                    }
                  >
                    N/A
                  </button>
                </div>
              </Field>
              <Field label="Vehicle condition">
                <select
                  className="field"
                  required
                  value={form.condition}
                  onChange={(e) => set("condition", e.target.value)}
                >
                  <option value="">Select condition…</option>
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                {form.condition && (
                  <p className="mt-1.5 text-xs text-ink-3">
                    {CONDITIONS.find((c) => c.value === form.condition)?.hint}
                  </p>
                )}
              </Field>
            </div>
          </Section>
        </div>

        {/* 2 — Documentation checklist */}
        <div style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.09s both" }}>
            <Section n={2} title="Documentation">
              <div className="space-y-2.5">
                {/* The run reads in the order it is asked at the roadside:
                    registration, tax, fitness, insurance, case slip, keys.
                    Five of the six are admin-managed questions and one is a
                    first-class field, so the field is slotted into the sort
                    order rather than pinned to the top — an ARO working down
                    the page should never have to jump back up it. */}
                {beforeCaseSlip.map((q) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    answer={answers[q.id]}
                    onAnswer={toggleAnswer}
                    onNote={setNote}
                  />
                ))}

                {/* The fine is money, and money kept in a free-text note
                    cannot be totalled later — which is why this one is a field
                    and not a checklist row. */}
                <div className="rounded-lg border border-rule bg-surface-2 p-3 transition-colors hover:border-rule-strong">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-ink">Is any case slip?</span>
                    <YesNo
                      value={form.hasCaseSlip}
                      onChange={(v) =>
                        setForm((f) => ({
                          ...f,
                          hasCaseSlip: v,
                          // Clearing the amount with the answer stops a fine
                          // typed then retracted from reaching the record.
                          caseSlipFine: v ? f.caseSlipFine : "",
                        }))
                      }
                    />
                  </div>
                  {form.hasCaseSlip === true && (
                    <div className="mt-2.5" style={{ animation: "slideDown 0.15s var(--ease-standard)" }}>
                      <label className="label mb-1.5 block" htmlFor="case-slip-fine">
                        Fine amount
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-3">
                          Tk
                        </span>
                        <NumberField
                          id="case-slip-fine"
                          className="field pl-9 font-mono tnum"
                          value={form.caseSlipFine}
                          onChange={(v) => set("caseSlipFine", v)}
                          placeholder="0"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* What the seizure cost on the day.
                    Required, like everything else on this form now. The earlier
                    reasoning — that an officer without a figure to hand would
                    answer a required field with a guess — is a real cost and
                    worth knowing about; against it, this is money that left the
                    business and the officer who spent it is the only person who
                    will ever know the number. Zero is a legitimate answer.
                    It is a record for the Recovery Manager and nothing else —
                    the note under it says so plainly, because an officer who
                    thinks this feeds the resale price will under-report it. */}
                <div className="rounded-lg border border-rule bg-surface-2 p-3 transition-colors hover:border-rule-strong">
                  <label className="label mb-1.5 block" htmlFor="capture-cost">
                    Capture cost
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-ink-3">
                      Tk
                    </span>
                    <NumberField
                      id="capture-cost"
                      className="field pl-9 font-mono tnum"
                      value={form.captureCost}
                      onChange={(v) => set("captureCost", v)}
                      placeholder="2,500"
                    />
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
                    What it cost to recover the vehicle today — agent, transport, anything paid on
                    the spot. Recorded for the Recovery Operations HQ only; it does not affect the
                    repair budget, the SOP or the resale price.
                  </p>
                </div>

                {afterCaseSlip.map((q) => (
                  <QuestionRow
                    key={q.id}
                    question={q}
                    answer={answers[q.id]}
                    onAnswer={toggleAnswer}
                    onNote={setNote}
                  />
                ))}
              </div>
            </Section>
        </div>

        {/* 3 — Placement */}
        <div style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.12s both" }}>
          <Section n={3} title="Placement">
            {/* When the seizure happened.
                First in this section rather than buried at the end, because
                during a backfill it is the field most likely to be wrong and
                the one nobody notices is wrong until months later. Defaulted to
                today and capped there — a capture cannot be dated forward —
                with the chosen day echoed in words underneath, because a date
                input reads dd/mm or mm/dd depending on the phone's locale and
                08/09 is a different vehicle from 09/08. */}
            <Field label="Date captured">
              <input
                type="date"
                className="field font-mono"
                value={form.captureDate}
                max={today()}
                min={yearsAgoISO(3)}
                onChange={(e) => set("captureDate", e.target.value)}
                required
              />
              <p className="mt-1.5 text-xs text-ink-3">
                {form.captureDate === today() ? (
                  "Today. Change it if the vehicle was seized earlier."
                ) : (
                  <span className="text-warn-ink">
                    Backdated to {longDateLabel(form.captureDate)} — recorded on the file.
                  </span>
                )}
              </p>
            </Field>
            <Field label="Sales territory">
              {/* This officer's own patches, and nothing else — their base
                  first, then anything they have been handed to cover. The
                  route decides the list (see /api/capture/options); the form
                  only renders it, so all three intake forms narrow the same
                  way without each one repeating the rule. */}
              <select className="field" value={form.territoryId} onChange={(e) => set("territoryId", e.target.value)} required>
                {options.territories.length !== 1 && <option value="">Select territory…</option>}
                {options.territories.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              {/* One territory is not a choice, so it is stated rather than
                  offered. More than one means they are covering, and saying
                  which is theirs is the difference between picking the right
                  one and picking the first one. */}
              <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                {options.territories.length === 0
                  ? "No territory is assigned to you — ask HQ before recording this capture."
                  : options.territories.length === 1
                    ? "Your territory."
                    : `Yours, and ${options.territories.length - 1} you are covering.`}
              </p>
            </Field>
            <Field label="Current location">
              {/* A vehicle ends up wherever it could be got to — a police
                  compound, the customer's own yard, a roadside. Those do not
                  belong in master data as one-off rows, so the last option
                  hands the ARO a text box instead of blocking the capture. */}
              <select
                className="field"
                value={locationOther ? "__other__" : form.currentLocationId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__other__") {
                    setLocationOther(true);
                    set("currentLocationId", "");
                  } else {
                    setLocationOther(false);
                    setForm((f) => ({ ...f, currentLocationId: v, currentLocationOther: "" }));
                  }
                }}
                required={!locationOther}
              >
                <option value="">Select location…</option>
                {options.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.type === "CUSTOMER" ? " · not on our premises" : ""}
                  </option>
                ))}
                <option value="__other__">Somewhere else — type it…</option>
              </select>

              {locationOther && (
                <input
                  autoFocus
                  className="field mt-2"
                  required
                  maxLength={120}
                  value={form.currentLocationOther}
                  onChange={(e) => set("currentLocationOther", e.target.value)}
                  placeholder="e.g. Savar police compound, beside the highway"
                  style={{ animation: "slideDown 0.15s var(--ease-standard)" }}
                />
              )}

              <p className="mt-1.5 text-xs text-ink-3">
                {locationOther
                  ? "Typed locations are kept on the record only — they are not added to master data."
                  : "Choose the customer option if the vehicle has not been moved to a yard yet."}
              </p>
            </Field>
          </Section>
        </div>

        {/* 4 — Condition & photos */}
        <div style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.15s both" }}>
          <Section n={4} title="Condition & photos">
            <Field label="Remarks">
              <textarea
                required
                className="field resize-none"
                rows={3}
                value={form.remarks}
                onChange={(e) => set("remarks", e.target.value)}
                placeholder="Dents, missing parts, engine notes…"
              />
            </Field>

            {/* A remark about a specific dent, a leaking seal, a missing
                mirror is far more use with the thing attached to it.
                Required now, like everything else on this form. Worth knowing
                what it costs: the earlier note here argued that forcing a
                photo of prose gets a picture of a notepad, and on a capture
                with nothing specific to show that is what this will be. */}
            <div className="remark-shot">
              <div className="min-w-0 flex-1">
                <div className="label mb-1">Photo of a specific remark</div>
                <p className="text-xs leading-snug text-ink-3">
                  Photograph whatever your remarks describe — the dent, the seal, the missing part.
                </p>
              </div>
              <div className="w-[92px] shrink-0">
                <PhotoTile
                  slot="REMARKS"
                  state={photos.REMARKS}
                  onPick={handlePhoto}
                  onClear={clearPhoto}
                />
              </div>
            </div>

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

        {/* 5 — Assignment */}
        <div style={{ animation: "slideUp 0.2s var(--ease-out-quart) 0.18s both" }}>
          <Section
            n={5}
            title="Assignment"
            hint="The letter ladder starts by itself: Letter 1 falls due tomorrow, Letter 2 seven days after that goes out, Letter 3 seven days later. You serve them one at a time from the vehicle's card."
          >
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

            {/* The signed paper form. Required along with everything else on
                this form now: it is the customer'''s signature on the seizure,
                and a record that reaches the Credit Note desk without it has
                to be chased back to the roadside to get one. */}
            <div>
              <div className="label mb-2">Capture form</div>
              <div className="grid grid-cols-3 gap-2.5">
                <PhotoTile
                  slot="CAPTURE_FORM"
                  state={photos.CAPTURE_FORM}
                  onPick={handlePhoto}
                  onClear={clearPhoto}
                />
              </div>
              <p className="mt-1.5 text-xs text-ink-3">
                Photograph the signed capture form so the paperwork travels with the record.
              </p>
            </div>
          </Section>
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-bad/25 bg-bad-soft px-4 py-3 text-bad-ink" style={{ animation: "scaleIn 0.15s var(--ease-spring)" }}>
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

/**
 * One documentation question.
 *
 * Extracted when the run was split around the case slip: two copies of this
 * markup would have drifted the moment either half was touched, and the whole
 * point of the split is that the six rows read as one list.
 */
function QuestionRow({
  question,
  answer,
  onAnswer,
  onNote,
}: {
  question: { id: string; label: string; requiresNote: boolean };
  answer?: { answer: boolean; note: string };
  onAnswer: (id: string, v: boolean) => void;
  onNote: (id: string, note: string) => void;
}) {
  return (
    <div className="rounded-lg border border-rule bg-surface-2 p-3 transition-colors hover:border-rule-strong">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{question.label}</span>
        <YesNo value={answer?.answer} onChange={(v) => onAnswer(question.id, v)} />
      </div>
      {question.requiresNote && answer?.answer === false && (
        <input
          className="field mt-2.5 text-sm"
          placeholder="Add a note…"
          value={answer?.note ?? ""}
          onChange={(e) => onNote(question.id, e.target.value)}
          style={{ animation: "slideDown 0.15s var(--ease-standard)" }}
        />
      )}
    </div>
  );
}

function Section({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  /** A line under the heading, for a section whose rule is not self-evident. */
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
      {hint && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-3">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
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
              <div className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-ok text-white" style={{ animation: "scaleIn 0.2s var(--ease-spring)" }}>
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
            <span className="text-[11px] font-semibold tracking-wide">{SLOT_LABEL[slot]}</span>
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
      <div className="mt-1 text-center font-mono text-[10px] uppercase tracking-wide text-ink-3">
        {SLOT_LABEL[slot]}
      </div>
    </div>
  );
}

/**
 * useSearchParams needs a Suspense boundary above it. The fallback matches the
 * form's own loading state so arriving from a request does not flash a
 * different skeleton than arriving directly.
 */
export default function CaptureScreen() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-[60vh] place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="animate-spin text-accent" size={26} />
            <span className="text-sm text-ink-3">Loading capture form…</span>
          </div>
        </div>
      }
    >
      <CaptureForm />
    </Suspense>
  );
}

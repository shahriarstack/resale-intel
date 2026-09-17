"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  FileText,
  FileUp,
  Loader2,
  Save,
  Send,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { sendJSON, uploadDocument } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { isPdfUrl } from "@/lib/photos";
import { taka } from "@/lib/format";
import { NumberField } from "@/components/ui/NumberField";
import { HandoffDialog } from "@/components/ui/HandoffDialog";

/**
 * The Service Engineer's cost analysis.
 *
 * This used to ask for the estimate line by line: a description and an amount
 * per repair item, typed on a phone next to a half-stripped vehicle. It was
 * transcription. The workshop already produces a written estimate, the engineer
 * was holding it, and the app was asking them to make a worse copy of it —
 * slower to enter, and no more authoritative than the sheet it came from.
 *
 * So the sheet IS the submission. Two things are asked for now:
 *
 *   THE NUMBER   one figure, the total the Service Manager is being asked to
 *     authorise. It is the only thing typed, so it gets a field sized like it
 *     matters.
 *
 *   THE SHEET    the estimate itself, photographed or as a PDF. Whichever the
 *     workshop produced; refusing one format only means it gets photographed
 *     off a screen.
 *
 * Everything else follows from being used one-handed in a workshop: a numeric
 * keypad on the money fields, 44px minimum targets, and a submit bar pinned to
 * the bottom so it is never scrolled off.
 */

interface ExistingSheet {
  id: string;
  url: string;
}

interface NewSheet {
  key: string;
  status: "busy" | "done" | "error";
  /** Object URL for an image; null for a PDF, which has no inline preview. */
  preview: string | null;
  fileName: string;
  isPdf: boolean;
  name?: string;
}

let counter = 0;
const uid = () => `s${counter++}`;

export function EngineerAssessmentPanel({
  vehicleId,
  subject,
  initialRepairCost,
  initialNote,
  initialTransport,
  initialOther,
  existingSheets,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  initialRepairCost: number;
  initialNote: string;
  initialTransport: number;
  initialOther: number;
  existingSheets: ExistingSheet[];
}) {
  const router = useRouter();
  const sheetRef = useRef<HTMLInputElement>(null);

  const [repairCost, setRepairCost] = useState(String(initialRepairCost || ""));
  const [note, setNote] = useState(initialNote);
  const [transport, setTransport] = useState(String(initialTransport || ""));
  const [other, setOther] = useState(String(initialOther || ""));
  const [sheets, setSheets] = useState<ExistingSheet[]>(existingSheets);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newSheets, setNewSheets] = useState<NewSheet[]>([]);
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState("");
  const [handedOff, setHandedOff] = useState(false);

  // Object URLs are a manual resource. Without this the previews leak for the
  // life of the page, which on a phone session is real.
  useEffect(() => {
    return () => {
      for (const s of newSheets) if (s.preview) URL.revokeObjectURL(s.preview);
    };
    // Cleanup only on unmount: the list is read from the closure at teardown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repair = parseFloat(repairCost) || 0;
  const grandTotal = repair + (parseFloat(transport) || 0) + (parseFloat(other) || 0);
  const sheetCount = sheets.length + newSheets.filter((s) => s.status === "done").length;
  const uploading = newSheets.some((s) => s.status === "busy");
  const ready = repair > 0 && sheetCount > 0 && !uploading;

  const addSheets = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const key = uid();
      const isPdf = file.type === "application/pdf";
      // A PDF is uploaded whole; a photograph of a written sheet gets the same
      // downscale every other camera upload gets.
      const preview = isPdf ? null : URL.createObjectURL(file);
      setNewSheets((n) => [
        ...n,
        { key, status: "busy", preview, fileName: file.name, isPdf },
      ]);
      try {
        const payload = isPdf ? file : await compressImage(file);
        const { name } = await uploadDocument(payload);
        setNewSheets((n) => n.map((s) => (s.key === key ? { ...s, status: "done", name } : s)));
      } catch (e) {
        setNewSheets((n) => n.map((s) => (s.key === key ? { ...s, status: "error" } : s)));
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }
  };

  const dropNew = (key: string) =>
    setNewSheets((n) => {
      const gone = n.find((s) => s.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return n.filter((s) => s.key !== key);
    });

  const removeExisting = (id: string) => {
    setSheets((s) => s.filter((x) => x.id !== id));
    setRemoved((r) => [...r, id]);
  };

  const save = async (submit: boolean) => {
    setError("");
    if (submit) {
      if (repair <= 0) {
        setError("Enter the repair cost before submitting.");
        return;
      }
      if (sheetCount === 0) {
        setError("Upload the repair estimate sheet before submitting.");
        return;
      }
    }
    if (uploading) {
      setError("Wait for the upload to finish.");
      return;
    }

    setBusy(submit ? "submit" : "draft");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/assessment`, "POST", {
        repairCost: repair,
        repairNote: note.trim(),
        transportCost: parseFloat(transport) || 0,
        otherCost: parseFloat(other) || 0,
        newSheetNames: newSheets.filter((s) => s.status === "done").map((s) => s.name),
        removeSheetIds: removed,
        submit,
      });
      if (submit) {
        // The panel stays behind the receipt; leaving happens when it is
        // dismissed, not underneath it.
        setHandedOff(true);
      } else {
        setNewSheets([]);
        setRemoved([]);
        router.refresh();
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const handoff = (
    <HandoffDialog
      open={handedOff}
      title="Estimate submitted"
      subject={subject}
      facts={[
        { label: "Repair", value: taka(repair), strong: true },
        { label: "Transport", value: taka(parseFloat(transport) || 0) },
        { label: "Other", value: taka(parseFloat(other) || 0) },
        { label: "Estimate sheets", value: String(sheetCount) },
      ]}
      nextDesk="Service Manager"
      nextAction="Reviews the estimate and authorises the repair budget."
      thanks="Thank you — the sheet you attached is what the whole approval rests on."
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel assess-panel">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
          <Wrench size={16} className="text-accent" />
          Cost analysis
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          Enter the total repair cost and upload the estimate sheet — a photo of the written
          estimate, or a PDF.
        </p>
      </div>

      <div className="space-y-3.5 px-4 py-3.5 sm:px-5">
        {/* ---- The number ----
            The one thing typed, so it is sized like the one thing that matters:
            a full-width field with the currency inline and a big numeral. */}
        <div>
          <label htmlFor="repair-cost" className="label mb-1.5">
            Total repair cost
          </label>
          <div className="money-field">
            <span className="money-prefix">Tk</span>
            <NumberField
              id="repair-cost"
              className="money-input tnum"
              value={repairCost}
              onChange={setRepairCost}
              placeholder="0"
            />
          </div>
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink-3">
            The figure on the estimate sheet. The Service Manager approves against this.
          </p>
        </div>

        {/* ---- The sheet ---- */}
        <div>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="label mb-0">Repair estimate sheet</span>
            <span className="font-mono text-[10px] text-ink-3">
              {sheetCount === 0 ? "required" : `${sheetCount} attached`}
            </span>
          </div>

          <button
            type="button"
            className="sheet-drop"
            onClick={() => sheetRef.current?.click()}
            disabled={uploading}
            data-empty={sheetCount === 0}
          >
            <span className="sheet-drop-glyph">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="sheet-drop-title">
                {uploading ? "Uploading…" : sheetCount === 0 ? "Add the estimate" : "Add another"}
              </span>
              <span className="sheet-drop-sub">PDF, or a photo of the written sheet</span>
            </span>
          </button>
          <input
            ref={sheetRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addSheets(e.target.files);
              e.target.value = "";
            }}
          />

          {(sheets.length > 0 || newSheets.length > 0) && (
            <ul className="sheet-list mt-2.5">
              {sheets.map((s) => (
                <li key={s.id} className="sheet-item">
                  <SheetFace url={s.url} />
                  <span className="min-w-0 flex-1">
                    <span className="sheet-name">
                      {isPdfUrl(s.url) ? "Estimate (PDF)" : "Estimate (photo)"}
                    </span>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="sheet-open"
                    >
                      Open
                    </a>
                  </span>
                  <button
                    type="button"
                    className="sheet-x"
                    onClick={() => removeExisting(s.id)}
                    aria-label="Remove this sheet"
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}

              {newSheets.map((s) => (
                <li key={s.key} className="sheet-item" data-state={s.status}>
                  {s.isPdf || !s.preview ? (
                    <span className="sheet-face" data-pdf>
                      <FileText size={16} />
                    </span>
                  ) : (
                    <span className="sheet-face">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.preview} alt="" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="sheet-name">{s.fileName}</span>
                    <span className="sheet-state">
                      {s.status === "busy" ? (
                        <>
                          <Loader2 size={10} className="animate-spin" /> uploading
                        </>
                      ) : s.status === "error" ? (
                        "failed — remove and try again"
                      ) : (
                        <>
                          <Check size={10} strokeWidth={3} /> ready
                        </>
                      )}
                    </span>
                  </span>
                  <button
                    type="button"
                    className="sheet-x"
                    onClick={() => dropNew(s.key)}
                    disabled={s.status === "busy"}
                    aria-label="Remove this upload"
                  >
                    <X size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ---- What the work is ----
            The sheet carries the itemisation. This is the one line the Service
            Manager reads on screen before deciding, and the line an as-is
            listing shows a buyer if the work never happens. */}
        <div>
          <label htmlFor="repair-note" className="label mb-1.5">
            What needs doing <span className="text-ink-3">(optional)</span>
          </label>
          <textarea
            id="repair-note"
            rows={2}
            maxLength={500}
            className="field resize-none text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Gearbox rebuild and offside body panel work"
          />
        </div>

        {/* ---- The other two costs ---- */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="transport" className="label mb-1.5">
              Transport (Tk)
            </label>
            <NumberField
              id="transport"
              className="field tnum text-sm"
              value={transport}
              onChange={setTransport}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor="other" className="label mb-1.5">
              Other (Tk)
            </label>
            <NumberField
              id="other"
              className="field tnum text-sm"
              value={other}
              onChange={setOther}
              placeholder="0"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
        )}
      </div>

      {/* ---- Pinned submit bar ----
          Adding a sheet must never push Submit off the end of a scroll. */}
      <div className="assess-bar">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Estimate total
          </span>
          <span className="font-display text-[19px] font-bold tnum text-ink">
            {taka(grandTotal)}
          </span>
        </div>
        <div className="mt-2.5 flex gap-2">
          <button
            className="btn btn-ghost flex-1"
            onClick={() => save(false)}
            disabled={busy !== null || uploading}
          >
            {busy === "draft" ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save draft
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={() => save(true)}
            disabled={busy !== null || !ready}
            title={
              ready
                ? "Send to the Service Manager"
                : "Enter the cost and attach the estimate sheet first"
            }
          >
            {busy === "submit" ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <>
                Submit <Send size={15} />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
    </>
  );
}

/** A saved sheet's thumbnail — the page for an image, a document mark for a PDF. */
function SheetFace({ url }: { url: string }) {
  if (isPdfUrl(url)) {
    return (
      <span className="sheet-face" data-pdf>
        <FileText size={16} />
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="sheet-face">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="Estimate sheet" />
    </a>
  );
}

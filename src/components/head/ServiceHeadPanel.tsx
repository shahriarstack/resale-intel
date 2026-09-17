"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Clock,
  AlertCircle,
  Pencil,
  X,
  ArrowRight,
  Wrench,
  PackageCheck,
  FileText,
  FileUp,
  Check,
  Trash2,
  ExternalLink,
} from "lucide-react";
import { sendJSON, uploadDocument } from "@/lib/http";
import { taka } from "@/lib/format";
import { NumberField } from "@/components/ui/NumberField";
import { HandoffDialog } from "@/components/ui/HandoffDialog";
import { isPdfUrl } from "@/lib/photos";

interface Sheet {
  id: string;
  url: string;
}

interface NewApprovalSheet {
  key: string;
  status: "busy" | "done" | "error";
  fileName: string;
  name?: string;
}

let approvalCounter = 0;
const approvalUid = () => `a${approvalCounter++}`;

/**
 * The repair decision.
 *
 * This desk used to have one exit: approve a repair and set a deadline. In
 * practice a share of recovered vehicles do not need the work — the estimate
 * gets written because the engineer assesses everything, but spending it would
 * cost more than it returns on a vehicle that will sell perfectly well in the
 * state it arrived in. There was nowhere to say that, so it was said by
 * approving a repair nobody then did.
 *
 * So the panel is now a fork, and the two exits are shown as what they are:
 * a choice between spending the estimate and not spending it. Picking "sell as
 * is" prices the decision immediately — the estimate leaves the cost basis and
 * the margin moves by exactly that amount — because that number is the whole
 * argument, and a manager should not have to do the subtraction in their head
 * to see it.
 *
 * What as-is does NOT do is throw the estimate away. The lines survive as the
 * disclosed fault list on the marketplace listing, which is the difference
 * between selling something honestly and selling it quietly.
 */
export function ServiceHeadPanel({
  vehicleId,
  subject,
  repairCost,
  repairNote,
  sheets,
  transportCost,
  otherCost,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  /** The engineer's quoted repair total. */
  repairCost: number;
  /** Their one-line description of the work, if they gave one. */
  repairNote: string | null;
  /** The estimate documents the figure is quoted against. */
  sheets: Sheet[];
  transportCost: number;
  otherCost: number;
}) {
  const router = useRouter();

  // The engineer's original figures — kept for comparison, never mutated.
  const origRepair = repairCost;
  const origTotal = origRepair + transportCost + otherCost;

  const [editing, setEditing] = useState(false);
  const [repair, setRepair] = useState(String(repairCost || ""));
  const [transport, setTransport] = useState(String(transportCost || ""));
  const [other, setOther] = useState(String(otherCost || ""));
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState<null | "save" | "approve" | "asis">(null);
  const [error, setError] = useState("");
  // Which decision was taken, so the receipt can describe the right one.
  const [handedOff, setHandedOff] = useState<null | "approved" | "asis">(null);

  /** Which way out of this desk the manager is taking. */
  const [route, setRoute] = useState<"repair" | "asis">("repair");
  const [asIsReason, setAsIsReason] = useState("");

  // The signed approval sheet — required before a repair may be authorised.
  const sheetRef = useRef<HTMLInputElement>(null);
  const [approvalSheets, setApprovalSheets] = useState<NewApprovalSheet[]>([]);
  const sheetsUploading = approvalSheets.some((s) => s.status === "busy");
  const readySheetNames = approvalSheets.filter((s) => s.status === "done").map((s) => s.name!);

  const addApprovalSheet = async (files: FileList) => {
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        setError("The approval sheet must be a PDF.");
        continue;
      }
      const key = approvalUid();
      setApprovalSheets((s) => [...s, { key, status: "busy", fileName: file.name }]);
      try {
        const { name } = await uploadDocument(file);
        setApprovalSheets((s) => s.map((x) => (x.key === key ? { ...x, status: "done", name } : x)));
      } catch (e) {
        setApprovalSheets((s) => s.map((x) => (x.key === key ? { ...x, status: "error" } : x)));
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }
  };

  const dropApprovalSheet = (key: string) =>
    setApprovalSheets((s) => s.filter((x) => x.key !== key));

  const curRepair = editing ? parseFloat(repair) || 0 : origRepair;
  const curTransport = editing ? parseFloat(transport) || 0 : transportCost;
  const curOther = editing ? parseFloat(other) || 0 : otherCost;
  const curTotal = curRepair + curTransport + curOther;
  const delta = curTotal - origTotal;
  const changed = editing && delta !== 0;
  const deltaPct = origTotal > 0 ? (delta / origTotal) * 100 : 0;

  const buildEdit = () => ({
    editCosts: true,
    repairCost: parseFloat(repair) || 0,
    transportCost: parseFloat(transport) || 0,
    otherCost: parseFloat(other) || 0,
  });

  const cancelEdit = () => {
    setRepair(String(repairCost || ""));
    setTransport(String(transportCost || ""));
    setOther(String(otherCost || ""));
    setEditing(false);
    setError("");
  };

  const saveAdjustment = async () => {
    setError("");
    setBusy("save");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/repair-approval`, "POST", { approve: false, ...buildEdit() });
      setEditing(false);
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const sellAsIs = async () => {
    if (!asIsReason.trim()) {
      setError("Say why no work is needed — it is the record of a decision that removes the whole repair budget.");
      return;
    }
    setBusy("asis");
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/repair-approval`, "POST", {
        approve: false,
        asIs: true,
        asIsReason: asIsReason.trim(),
      });
      setHandedOff("asis");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark as is");
      setBusy(null);
    }
  };

  const approve = async () => {
    const n = parseInt(days, 10);
    if (!n || n < 1) {
      setError("Enter a repair timeframe of at least one day.");
      return;
    }
    if (sheetsUploading) {
      setError("Wait for the approval sheet to finish uploading.");
      return;
    }
    if (readySheetNames.length === 0) {
      setError("Attach the signed approval sheet (PDF) before approving.");
      return;
    }
    setBusy("approve");
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/repair-approval`, "POST", {
        approve: true,
        repairDays: n,
        sheetNames: readySheetNames,
        ...(changed ? buildEdit() : {}),
      });
      setHandedOff("approved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setBusy(null);
    }
  };

  const handoff = (
    <HandoffDialog
      open={handedOff !== null}
      tone={handedOff === "asis" ? "accent" : "ok"}
      title={handedOff === "asis" ? "Released for as-is sale" : "Repair approved"}
      subject={subject}
      facts={
        handedOff === "asis"
          ? [
              { label: "Repair budget", value: "None — sold as found", strong: true },
              { label: "Saved against estimate", value: taka(curTotal) },
            ]
          : [
              { label: "Repair", value: taka(curRepair) },
              { label: "Transport", value: taka(curTransport) },
              { label: "Other", value: taka(curOther) },
              { label: "Authorised", value: taka(curTotal), strong: true },
              { label: "Deadline", value: `${days} day${days === "1" ? "" : "s"}` },
              { label: "Approval sheet", value: `${readySheetNames.length} attached` },
            ]
      }
      nextDesk="Registration Team"
      nextAction={
        handedOff === "asis"
          ? "Takes it straight on for registration costing — no workshop time."
          : "Picks it up for registration costing once the repair is done."
      }
      thanks={
        handedOff === "asis"
          ? "Thank you — calling this early is what keeps money out of a vehicle that did not need it."
          : "Thank you — the engineer now knows exactly what they have been given and by when."
      }
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink">Repair approval</h2>
          <p className="text-xs text-ink-2">Review the estimate, adjust if needed, then set a deadline.</p>
        </div>
        {!editing ? (
          <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Adjust
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm shrink-0" onClick={cancelEdit} disabled={busy !== null}>
            <X size={13} /> Cancel
          </button>
        )}
      </div>

      {/* ---- The estimate ----
          One figure, and the document it was quoted against. The engineer no
          longer types a breakdown — the sheet IS the breakdown — so the job
          here is to put the number and its evidence side by side and make
          opening the evidence one tap. */}
      <div className="rounded-lg bg-surface-2 p-3.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="label mb-0">{editing ? "Adjusting estimate" : "Engineer estimate"}</span>
          {editing && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">editable</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div>
              <label className="label mb-1.5">Repair (Tk)</label>
              <NumberField
                className="field text-sm tnum"
                value={repair}
                onChange={setRepair}
                placeholder="0"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1.5">Transport (Tk)</label>
                <NumberField className="field text-sm tnum" value={transport} onChange={setTransport} placeholder="0" />
              </div>
              <div>
                <label className="label mb-1.5">Other (Tk)</label>
                <NumberField className="field text-sm tnum" value={other} onChange={setOther} placeholder="0" />
              </div>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            <li className="flex items-baseline justify-between gap-3">
              <span className="text-ink-2">Repair</span>
              <span className="tnum font-semibold text-ink">{taka(origRepair)}</span>
            </li>
            <li className="flex justify-between border-t border-rule pt-1.5 text-ink-2">
              <span>Transport</span><span className="tnum">{taka(transportCost)}</span>
            </li>
            <li className="flex justify-between text-ink-2">
              <span>Other</span><span className="tnum">{taka(otherCost)}</span>
            </li>
          </ul>
        )}

        {/* What the money is for, in the engineer's words. */}
        {repairNote && !editing && (
          <p className="mt-2.5 border-t border-rule pt-2.5 text-[12.5px] leading-snug text-ink-2">
            {repairNote}
          </p>
        )}

        {/* The evidence. A figure with no sheet behind it cannot be submitted,
            so there is always at least one of these to open. */}
        {sheets.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5 border-t border-rule pt-2.5">
            {sheets.map((sheet, i) => (
              <a
                key={sheet.id}
                href={sheet.url}
                target="_blank"
                rel="noreferrer"
                className="sheet-chip"
                title="Open the estimate the engineer submitted"
              >
                <FileText size={12} />
                {isPdfUrl(sheet.url) ? "Estimate PDF" : "Estimate sheet"}
                {sheets.length > 1 ? ` ${i + 1}` : ""}
                <ExternalLink size={10} className="opacity-60" />
              </a>
            ))}
          </div>
        )}

        {/* Total + delta */}
        <div className="mt-3 border-t border-rule pt-2.5">
          {changed ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Adjusted total</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tnum text-ink-3 line-through">{taka(origTotal)}</span>
                <ArrowRight size={12} className="text-ink-3" />
                <span className="tnum text-sm font-bold text-ink">{taka(curTotal)}</span>
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                  style={
                    delta > 0
                      ? { background: "var(--bad-soft)", color: "var(--bad-ink)" }
                      : { background: "var(--ok-soft)", color: "var(--ok-ink)" }
                  }
                >
                  {delta > 0 ? "+" : "−"}{taka(Math.abs(delta)).replace("Tk ", "")} ({delta > 0 ? "+" : ""}{deltaPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-sm font-semibold text-ink">
              <span>Total estimate</span>
              <span className="tnum">{taka(curTotal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save adjustment (only while editing with changes) */}
      {editing && (
        <button className="btn btn-ghost btn-block mt-3" onClick={saveAdjustment} disabled={busy !== null || !changed}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : "Save adjustment"}
        </button>
      )}

      {/* ---- The fork ----
          Two routes, shown side by side rather than one button and a hidden
          alternative. They are genuinely a choice, and the money each one
          commits is printed on the face of it. */}
      <div className="mt-4">
        <span className="label mb-1.5 block">What happens to this vehicle</span>
        <div className="route-pick">
          <button
            type="button"
            className="route"
            data-on={route === "repair"}
            aria-pressed={route === "repair"}
            onClick={() => { setRoute("repair"); setError(""); }}
            disabled={busy !== null}
          >
            <span className="route-glyph"><Wrench size={15} /></span>
            <span className="route-name">Repair it</span>
            <span className="route-money">{taka(curTotal)}</span>
            <span className="route-note">spend the estimate</span>
          </button>
          <button
            type="button"
            className="route"
            data-tone="warn"
            data-on={route === "asis"}
            aria-pressed={route === "asis"}
            onClick={() => { setRoute("asis"); setError(""); }}
            disabled={busy !== null}
          >
            <span className="route-glyph"><PackageCheck size={15} /></span>
            <span className="route-name">Sell as is</span>
            <span className="route-money">{taka(0)}</span>
            <span className="route-note">save {taka(curRepair)}</span>
          </button>
        </div>
      </div>

      {route === "repair" ? (
        <div className="mt-3.5">
          <label className="label mb-1.5">Repair timeframe (days)</label>
          <input className="field tnum text-lg font-semibold" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
          <p className="mt-1.5 text-xs text-ink-3">
            Starts a countdown; overdue vehicles are flagged. The engineer closes the job by
            photographing the finished vehicle.
          </p>

          {/* ---- Approval sheet ----
              The signed authorisation, attached before the repair can be
              approved. The engineer sees and downloads this exact document
              once the vehicle lands back on their desk. */}
          <div className="mt-3.5">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="label mb-0">Approval sheet</span>
              <span className="font-mono text-[10px] text-ink-3">
                {readySheetNames.length === 0 ? "required · PDF" : `${readySheetNames.length} attached`}
              </span>
            </div>
            <button
              type="button"
              className="sheet-drop"
              onClick={() => sheetRef.current?.click()}
              disabled={sheetsUploading || busy !== null}
              data-empty={approvalSheets.length === 0}
            >
              <span className="sheet-drop-glyph">
                {sheetsUploading ? <Loader2 size={18} className="animate-spin" /> : <FileUp size={18} />}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="sheet-drop-title">
                  {sheetsUploading ? "Uploading…" : approvalSheets.length === 0 ? "Add the approval sheet" : "Add another"}
                </span>
                <span className="sheet-drop-sub">PDF only</span>
              </span>
            </button>
            <input
              ref={sheetRef}
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) addApprovalSheet(e.target.files);
                e.target.value = "";
              }}
            />
            {approvalSheets.length > 0 && (
              <ul className="sheet-list mt-2.5">
                {approvalSheets.map((s) => (
                  <li key={s.key} className="sheet-item" data-state={s.status}>
                    <span className="sheet-face" data-pdf>
                      <FileText size={16} />
                    </span>
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
                      onClick={() => dropApprovalSheet(s.key)}
                      disabled={s.status === "busy"}
                      aria-label="Remove this upload"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3.5">
          <label className="label mb-1.5">Why no work is needed</label>
          <textarea
            rows={2}
            maxLength={280}
            className="field resize-none text-sm"
            value={asIsReason}
            onChange={(e) => setAsIsReason(e.target.value)}
            placeholder="e.g. Body marks are cosmetic; the truck runs and will sell at this grade without spending on it."
          />
          {/* The consequence, spelled out. Both halves matter: the money that
              stops being a cost, and the faults that start being a disclosure. */}
          <ul className="asis-effect mt-2.5">
            <li>
              <span>Repair estimate leaves the cost basis</span>
              <b>− {taka(curRepair)}</b>
            </li>
            <li>
              <span>{repairNote ? "The fault note is" : "The estimate sheet is"} shown on the listing</span>
              <b>disclosed</b>
            </li>
            <li>
              <span>Listing photographs</span>
              <b>recovery set</b>
            </li>
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      {route === "repair" ? (
        <button
          className="btn btn-ok btn-block mt-4"
          onClick={approve}
          disabled={busy !== null || sheetsUploading || readySheetNames.length === 0}
          title={readySheetNames.length === 0 ? "Attach the signed approval sheet first" : undefined}
        >
          {busy === "approve" ? <Loader2 size={16} className="animate-spin" /> : (<><Clock size={16} /> {changed ? "Approve adjusted estimate" : "Approve & set deadline"}</>)}
        </button>
      ) : (
        <button className="btn btn-warn btn-block mt-4" onClick={sellAsIs} disabled={busy !== null}>
          {busy === "asis" ? <Loader2 size={16} className="animate-spin" /> : (<><PackageCheck size={16} /> Release for as-is sale</>)}
        </button>
      )}
    </section>
    </>
  );
}

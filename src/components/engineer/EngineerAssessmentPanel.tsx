"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Camera, Loader2, X, Check, AlertCircle } from "lucide-react";
import { sendJSON, uploadImage } from "@/lib/http";
import { compressImage } from "@/lib/image";
import { taka } from "@/lib/format";

interface RepairLine {
  key: string;
  description: string;
  amount: string;
}
interface ExistingSheet {
  id: string;
  url: string;
}
interface NewSheet {
  key: string;
  status: "busy" | "done" | "error";
  preview: string;
  name?: string;
}

let counter = 0;
const uid = () => `r${counter++}`;

export function EngineerAssessmentPanel({
  vehicleId,
  initialLines,
  initialTransport,
  initialOther,
  existingSheets,
}: {
  vehicleId: string;
  initialLines: { description: string; amount: number }[];
  initialTransport: number;
  initialOther: number;
  existingSheets: ExistingSheet[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [lines, setLines] = useState<RepairLine[]>(
    initialLines.length
      ? initialLines.map((l) => ({ key: uid(), description: l.description, amount: String(l.amount) }))
      : [{ key: uid(), description: "", amount: "" }],
  );
  const [transport, setTransport] = useState(String(initialTransport || ""));
  const [other, setOther] = useState(String(initialOther || ""));
  const [sheets, setSheets] = useState<ExistingSheet[]>(existingSheets);
  const [removed, setRemoved] = useState<string[]>([]);
  const [newSheets, setNewSheets] = useState<NewSheet[]>([]);
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState("");

  const repairTotal = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const grandTotal = repairTotal + (parseFloat(transport) || 0) + (parseFloat(other) || 0);

  const setLine = (key: string, patch: Partial<RepairLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((ls) => [...ls, { key: uid(), description: "", amount: "" }]);
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  const removeExisting = (id: string) => {
    setSheets((s) => s.filter((x) => x.id !== id));
    setRemoved((r) => [...r, id]);
  };

  const addSheets = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const key = uid();
      const preview = URL.createObjectURL(file);
      setNewSheets((n) => [...n, { key, status: "busy", preview }]);
      try {
        const compressed = await compressImage(file);
        const { name } = await uploadImage(compressed);
        setNewSheets((n) => n.map((s) => (s.key === key ? { ...s, status: "done", name } : s)));
      } catch {
        setNewSheets((n) => n.map((s) => (s.key === key ? { ...s, status: "error" } : s)));
      }
    }
  };

  const save = async (submit: boolean) => {
    setError("");
    const cleanLines = lines
      .filter((l) => l.description.trim() || l.amount)
      .map((l) => ({ description: l.description.trim(), amount: parseFloat(l.amount) || 0 }));

    if (submit) {
      if (cleanLines.length === 0 || cleanLines.some((l) => !l.description)) {
        setError("Add at least one complete repair line (description + amount).");
        return;
      }
      if (sheets.length + newSheets.filter((s) => s.status === "done").length === 0) {
        setError("Upload at least one assessment sheet.");
        return;
      }
    }
    if (newSheets.some((s) => s.status === "busy")) {
      setError("Wait for sheet uploads to finish.");
      return;
    }

    setBusy(submit ? "submit" : "draft");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/assessment`, "POST", {
        repairLines: cleanLines,
        transportCost: parseFloat(transport) || 0,
        otherCost: parseFloat(other) || 0,
        newSheetNames: newSheets.filter((s) => s.status === "done").map((s) => s.name),
        removeSheetIds: removed,
        submit,
      });
      if (submit) {
        router.push("/dashboard");
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

  return (
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">Cost analysis</h2>
      <p className="mb-4 text-xs text-ink-2">Enter repair costs and attach the assessment sheet, then submit.</p>

      {/* Repair lines */}
      <div className="label mb-2">Repair items</div>
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            <input
              className="field text-sm"
              placeholder="e.g. Gearbox overhaul"
              value={l.description}
              onChange={(e) => setLine(l.key, { description: e.target.value })}
            />
            <input
              className="field w-28 text-sm tnum"
              type="number"
              inputMode="numeric"
              placeholder="Tk"
              value={l.amount}
              onChange={(e) => setLine(l.key, { amount: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeLine(l.key)}
              aria-label="Remove line"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:text-bad disabled:opacity-30"
              disabled={lines.length === 1}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={addLine} className="btn btn-ghost btn-sm mt-2.5">
        <Plus size={15} /> Add item
      </button>

      {/* Transport / other */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <label className="label mb-1.5">Transport (Tk)</label>
          <input className="field text-sm tnum" type="number" inputMode="numeric" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className="label mb-1.5">Other (Tk)</label>
          <input className="field text-sm tnum" type="number" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* Totals */}
      <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
        <div className="flex justify-between text-ink-2">
          <span>Repair</span>
          <span className="tnum">{taka(repairTotal)}</span>
        </div>
        <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold text-ink">
          <span>Estimate total</span>
          <span className="tnum">{taka(grandTotal)}</span>
        </div>
      </div>

      {/* Assessment sheets */}
      <div className="mt-4">
        <div className="label mb-2">Assessment sheets</div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addSheets(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="grid grid-cols-4 gap-2">
          {sheets.map((s) => (
            <SheetTile key={s.id} src={s.url} onRemove={() => removeExisting(s.id)} done />
          ))}
          {newSheets.map((s) => (
            <SheetTile
              key={s.key}
              src={s.preview}
              status={s.status}
              onRemove={() => setNewSheets((n) => n.filter((x) => x.key !== s.key))}
            />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid aspect-square place-items-center rounded-lg border-2 border-dashed border-rule-strong bg-surface-2 text-ink-3 active:scale-95"
          >
            <Camera size={20} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : "Save draft"}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy !== null}>
          {busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : "Submit"}
        </button>
      </div>
    </section>
  );
}

function SheetTile({
  src,
  status,
  done,
  onRemove,
}: {
  src: string;
  status?: "busy" | "done" | "error";
  done?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="relative aspect-square overflow-hidden rounded-lg border border-rule">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="Assessment sheet" loading="lazy" width={320} height={320} className="h-full w-full object-cover" />
      {status === "busy" && (
        <div className="absolute inset-0 grid place-items-center bg-black/45">
          <Loader2 size={16} className="animate-spin text-white" />
        </div>
      )}
      {(done || status === "done") && (
        <div className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-ok text-white">
          <Check size={10} strokeWidth={3} />
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 grid place-items-center bg-bad/70 text-[10px] font-semibold text-white">
          Failed
        </div>
      )}
      {status !== "busy" && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove sheet"
          className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-ink text-white"
        >
          <X size={10} strokeWidth={3} />
        </button>
      )}
    </div>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { taka } from "@/lib/format";
import { NumberField } from "@/components/ui/NumberField";

export interface EditableLine {
  key: string;
  description: string;
  amount: string;
  /**
   * Photo the Service Engineer attached to this line, if any.
   *
   * Carried through the editor read-only. The Service Manager adjusts an estimate
   * by replacing every line, so this has to survive the round trip or their
   * edit silently destroys the engineer's evidence. They can see it; they
   * cannot add or change it, because it is the engineer's record of what they
   * found.
   */
  photoName?: string | null;
}

let seq = 0;
export const newLine = (): EditableLine => ({ key: `l${seq++}`, description: "", amount: "" });

export function linesTotal(lines: EditableLine[]): number {
  return lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
}

export function cleanLines(lines: EditableLine[]) {
  return lines
    .filter((l) => l.description.trim() || l.amount)
    .map((l) => ({
      description: l.description.trim(),
      amount: parseFloat(l.amount) || 0,
      photoName: l.photoName ?? undefined,
    }));
}

// Controlled add/remove list of description + amount rows, with a live total.
export function CostLineEditor({
  lines,
  onChange,
  label = "Items",
  placeholder = "Description",
}: {
  lines: EditableLine[];
  onChange: (lines: EditableLine[]) => void;
  label?: string;
  placeholder?: string;
}) {
  const setLine = (key: string, patch: Partial<EditableLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = () => onChange([...lines, newLine()]);
  const remove = (key: string) => onChange(lines.length > 1 ? lines.filter((l) => l.key !== key) : lines);

  return (
    <div>
      <div className="label mb-2">{label}</div>
      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.key} className="flex items-center gap-2">
            {/* The engineer's evidence for this line. Shown, not editable —
                and carried through the save so adjusting the price does not
                delete the photograph of the part being paid for. */}
            {l.photoName && (
              <a
                href={`/api/files/${l.photoName}`}
                target="_blank"
                rel="noreferrer"
                className="line-thumb"
                title="Photo attached by the engineer — open full size"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/files/${l.photoName}`} alt="" width={72} height={72} />
              </a>
            )}
            <input
              className="field text-sm"
              placeholder={placeholder}
              value={l.description}
              onChange={(e) => setLine(l.key, { description: e.target.value })}
            />
            <NumberField
              className="field w-28 text-sm tnum"
              placeholder="Tk"
              value={l.amount}
              onChange={(v) => setLine(l.key, { amount: v })}
            />
            <button
              type="button"
              onClick={() => remove(l.key)}
              aria-label="Remove line"
              disabled={lines.length === 1}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:text-bad disabled:opacity-30"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" onClick={add} className="btn btn-ghost btn-sm">
          <Plus size={15} /> Add item
        </button>
        <span className="font-mono text-sm tnum text-ink">{taka(linesTotal(lines))}</span>
      </div>
    </div>
  );
}

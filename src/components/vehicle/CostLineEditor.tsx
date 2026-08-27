"use client";

import { Plus, Trash2 } from "lucide-react";
import { taka } from "@/lib/format";

export interface EditableLine {
  key: string;
  description: string;
  amount: string;
}

let seq = 0;
export const newLine = (): EditableLine => ({ key: `l${seq++}`, description: "", amount: "" });

export function linesTotal(lines: EditableLine[]): number {
  return lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
}

export function cleanLines(lines: EditableLine[]) {
  return lines
    .filter((l) => l.description.trim() || l.amount)
    .map((l) => ({ description: l.description.trim(), amount: parseFloat(l.amount) || 0 }));
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
            <input
              className="field text-sm"
              placeholder={placeholder}
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

"use client";

import { useState } from "react";

const PRESETS = [30, 60];

/**
 * "30 Days · 60 Days · Custom" — the one control every registration-validity
 * form in this app uses to choose a window.
 *
 * Fully controlled by `value`/`onChange` so three different callers (the
 * initial submission panel, the standing-watch panel on the vehicle page, and
 * the quick-renew row on the desk board) can never drift into three slightly
 * different pickers. Custom is a real third option, not a fallback: picking
 * it focuses a plain number input rather than leaving one visible at all
 * times competing with the two presets for attention.
 */
export function ValidityDaysPicker({
  value,
  onChange,
  disabled = false,
}: {
  /** Days, as a string — the caller's own state, so this owns no source of truth. */
  value: string;
  onChange: (days: string) => void;
  disabled?: boolean;
}) {
  // Custom mode is separate from the value itself: a preset day count typed
  // by hand into the custom box should not suddenly look like a preset was
  // clicked, and clearing the custom box while it is open should not fall
  // back to a preset that was never chosen.
  const [custom, setCustom] = useState(!PRESETS.includes(Number(value)));

  return (
    <div className="vdp">
      <div className="seg" role="group" aria-label="Validity period">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            className="seg-btn"
            data-on={!custom && value === String(p)}
            disabled={disabled}
            onClick={() => {
              setCustom(false);
              onChange(String(p));
            }}
          >
            {p} Days
          </button>
        ))}
        <button
          type="button"
          className="seg-btn"
          data-on={custom}
          disabled={disabled}
          onClick={() => setCustom(true)}
        >
          Custom
        </button>
      </div>

      {custom && (
        <div className="vdp-custom" style={{ animation: "slideDown 0.15s var(--ease-standard)" }}>
          <input
            autoFocus
            className="field h-9 w-24 py-0 text-center text-sm tnum"
            type="number"
            inputMode="numeric"
            min={1}
            max={730}
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="text-xs text-ink-3">days from today</span>
        </div>
      )}
    </div>
  );
}

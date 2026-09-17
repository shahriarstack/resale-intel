"use client";

/**
 * A number field that groups its digits as you type.
 *
 * `1200000` is a number you have to count with your finger. `12,00,000` is one
 * you read. Nearly every figure in this product is taka and several of them run
 * to seven — a repair estimate, an outstanding balance, an approved price — and
 * the field where somebody types those was the last place in the product still
 * showing them ungrouped.
 *
 * Four things it does that a naive formatter gets wrong:
 *
 *  - **It groups exactly the way `taka()` does.** Both go in threes, because
 *    `format.ts` deliberately picked `en-BD` over lakh–crore grouping. On the
 *    intake form the typed figure and its echo line sit six pixels apart, so a
 *    field that grouped 452000 as 4,52,000 next to a label reading Tk 452,000
 *    would be worse than one that did not group at all. If that decision is
 *    ever revisited, `GROUP` below is the only line to change here.
 *
 *  - **It leaves you alone mid-thought.** A trailing decimal point, a lone
 *    minus, a half-typed `1.0` — none of those get rewritten, because
 *    reformatting under the cursor as someone types a decimal is how a field
 *    starts fighting its user. Grouping applies to the integer part only.
 *
 *  - **It keeps the caret where you put it.** Inserting a comma to the left of
 *    the cursor would otherwise shunt the caret one place backwards on every
 *    fourth keystroke. The caret is re-placed by counting the number-carrying
 *    characters to its RIGHT — measured from the right because that is the end
 *    grouping does not move, and counting digits from the left instead lands
 *    you on the wrong side of a trailing decimal point.
 *
 *  - **Backspace deletes a digit, never a comma.** Separators are not
 *    characters the user typed, so removing one and leaving the number
 *    unchanged just costs a keypress. A deletion that would be a no-op is
 *    turned into a deletion of the digit beyond it.
 *
 *  - **It reports the raw string, not the display.** Callers keep the exact
 *    string contract a plain `<input>` gave them — `""` for empty, no commas —
 *    so every `Number(x)` and `x.trim() === ""` check already written upstream
 *    keeps working, and no comma can ever reach an API body.
 */

import { useLayoutEffect, useRef } from "react";

/** Insert a separator every three digits, matching `taka()`. */
const GROUP = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Raw → display. Preserves a partly-typed decimal tail. */
export function groupNumber(raw: string): string {
  if (raw === "" || raw === "-") return raw;
  const neg = raw.startsWith("-");
  const body = neg ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  const int = (dot === -1 ? body : body.slice(0, dot)).replace(/\D/g, "");
  // Tested on the dot's presence, not on the fraction being non-empty:
  // someone who has typed "1200." is mid-number and the point must survive.
  const tail = dot === -1 ? "" : `.${body.slice(dot + 1).replace(/\D/g, "")}`;
  return `${neg ? "-" : ""}${GROUP(int)}${tail}`;
}

/** Display → raw. Strips grouping and anything that is not part of a number. */
function ungroup(display: string, allowNegative: boolean): string {
  const neg = allowNegative && display.trimStart().startsWith("-");
  const cleaned = display.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  // Second and later dots are dropped rather than truncating the number.
  const raw = dot === -1 ? cleaned : `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replace(/\./g, "")}`;
  return neg ? `-${raw}` : raw;
}

/** Count the number-carrying characters after `pos` — the measure grouping leaves alone. */
const tailLen = (s: string, pos: number) => (s.slice(pos).match(/[\d.]/g) ?? []).length;

export function NumberField({
  value,
  onChange,
  allowNegative = false,
  className = "field",
  ...rest
}: {
  /** The raw value: digits, an optional dot, no separators. `""` when empty. */
  value: string;
  /** Called with the raw value — never the grouped display. */
  onChange: (raw: string) => void;
  allowNegative?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const ref = useRef<HTMLInputElement>(null);
  /** How many number characters should sit to the right of the caret after the next paint. */
  const caret = useRef<number | null>(null);

  const display = groupNumber(value);

  // Restored before paint, so the caret never visibly jumps to the end and
  // back. Only after a keystroke we handled — a click that moved the caret
  // somewhere else leaves this null and is left alone.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || caret.current === null) return;
    const want = caret.current;
    caret.current = null;

    let seen = 0;
    let pos = 0;
    for (let i = display.length - 1; i >= 0; i--) {
      if (/[\d.]/.test(display[i])) {
        seen++;
        if (seen === want) {
          pos = i;
          break;
        }
      }
    }
    if (want === 0) pos = display.length;
    // Never park to the right of a separator: visually that is the same gap,
    // but it reads as though the comma belongs to what you just typed.
    while (pos > 0 && display[pos - 1] === ",") pos--;
    el.setSelectionRange(pos, pos);
  }, [display]);

  return (
    <input
      {...rest}
      ref={ref}
      // `text`, not `number`: a number input rejects commas outright, and its
      // spinner and locale parsing both fight the formatting.
      type="text"
      inputMode={allowNegative ? "text" : "decimal"}
      autoComplete="off"
      className={className}
      value={display}
      onChange={(e) => {
        const typed = e.target.value;
        const at = e.target.selectionStart ?? typed.length;
        let raw = ungroup(typed, allowNegative);
        let tail = tailLen(typed, at);

        // A shorter box holding the same number means the only thing deleted
        // was a separator. Take the digit past it instead, so backspace always
        // does something.
        if (raw === value && typed.length < display.length) {
          const cut = raw.length - tail - 1;
          if (cut >= 0) raw = raw.slice(0, cut) + raw.slice(cut + 1);
        }

        // An empty integer part is an unfinished ".5", not a number yet; the
        // caret would otherwise be measured against a leading zero we add.
        tail = Math.min(tail, raw.replace(/[^\d.]/g, "").length);
        caret.current = tail;
        onChange(raw);
      }}
    />
  );
}

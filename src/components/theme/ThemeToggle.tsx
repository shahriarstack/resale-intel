"use client";

import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme, type ThemeChoice } from "./ThemeProvider";

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon },
];

/**
 * A three-way segmented control rather than the usual sun/moon flip.
 *
 * A binary switch cannot express "follow my OS", which is what most people
 * actually want — and it lies about the current state whenever the OS is the
 * thing driving it. Three explicit segments say what is true.
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { choice, setChoice } = useTheme();

  if (compact) {
    // Collapsed sidebar / mobile header: cycle in place.
    const order: ThemeChoice[] = ["light", "system", "dark"];
    const current = OPTIONS.find((o) => o.value === choice) ?? OPTIONS[1];
    const Icon = current.icon;
    return (
      <button
        onClick={() => setChoice(order[(order.indexOf(choice) + 1) % order.length])}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label={`Theme: ${current.label}. Click to change.`}
        title={`Theme: ${current.label}`}
      >
        <Icon size={16} />
      </button>
    );
  }

  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label="Colour theme"
      data-active={choice}
    >
      {OPTIONS.map((o) => {
        const Icon = o.icon;
        const active = choice === o.value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => setChoice(o.value)}
            className="seg-btn"
            data-on={active}
            title={o.label}
          >
            <Icon size={13} />
            <span className="seg-label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

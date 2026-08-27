import type { Tone } from "@/lib/status";

const toneClass: Record<Tone, string> = {
  neutral: "chip-neutral",
  accent: "chip-accent",
  ok: "chip-ok",
  warn: "chip-warn",
  bad: "chip-bad",
};

export function Chip({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={`chip ${toneClass[tone]} ${className}`}>{children}</span>;
}

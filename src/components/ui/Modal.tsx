"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Portal-based modal.
 *
 * Rendering into `document.body` (rather than the caller's tree) sidesteps
 * every containment gotcha with `position: fixed` — an ancestor with a
 * `transform`, `filter`, `perspective` or `will-change` traps a fixed child
 * inside its box. Portalling escapes them all in one move.
 *
 * Also owns the modal chrome that every dialog needs: escape-to-close,
 * body-scroll lock, backdrop click, and the enter animation.
 */
export function Modal({
  open,
  onClose,
  children,
  variant = "center",
  size = "md",
  labelledBy,
  /** Set false for destructive dialogs where an accidental click would sting. */
  closeOnBackdrop = true,
  /** Set false while a submit is in flight. */
  closeOnEscape = true,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "center" | "mobile";
  size?: "sm" | "md" | "lg";
  labelledBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes, and the page beneath stops scrolling while the dialog is open.
  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, closeOnEscape]);

  if (!mounted || !open) return null;

  const maxWidth = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-lg" : "max-w-md";

  return createPortal(
    <div
      className={`backdrop ${variant === "mobile" ? "backdrop-mobile" : "backdrop-center"}`}
      onClick={() => closeOnBackdrop && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
    >
      <div className={`modal-panel ${maxWidth}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Standard dialog header: a title (optional icon, optional subtitle) and a
 * close button on the right. Keeps every dialog looking the same without
 * repeating the markup at every callsite.
 */
export function ModalHeader({
  title,
  subtitle,
  icon,
  onClose,
  tone = "neutral",
  titleId,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  onClose?: () => void;
  tone?: "neutral" | "accent" | "warn" | "bad";
  titleId?: string;
}) {
  const color =
    tone === "accent"
      ? "var(--accent)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--ink-3)";
  const soft =
    tone === "accent"
      ? "var(--accent-soft)"
      : tone === "warn"
        ? "var(--warn-soft)"
        : tone === "bad"
          ? "var(--bad-soft)"
          : "var(--surface-3)";

  return (
    <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ background: soft, color }}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 id={titleId} className="font-display text-lg font-bold text-ink">
            {title}
          </h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          onClick={onClose}
          aria-label="Close"
        >
          <X size={17} />
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="px-5 pb-4">{children}</div>;
}

export function ModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule px-5 py-3.5">
      {children}
    </div>
  );
}

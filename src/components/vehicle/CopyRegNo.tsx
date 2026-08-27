"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyRegNo({ regNo }: { regNo: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(regNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <button
      onClick={copy}
      className="group inline-flex items-center gap-1.5 font-mono text-sm text-ink-3 transition-colors hover:text-accent"
      title="Copy registration number"
    >
      {regNo}
      {copied ? (
        <Check size={13} className="text-ok" />
      ) : (
        <Copy size={13} className="opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

"use client";

import { AlertTriangle } from "lucide-react";

// Route-level error boundary. Renders inside the root layout, so it has the
// full design system available.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="grid min-h-[80vh] place-items-center px-6">
      <div className="card-lg w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-bad-soft text-bad">
          <AlertTriangle size={24} />
        </div>
        <h1 className="font-display text-2xl font-bold text-ink">Something went wrong</h1>
        <p className="mt-2 text-sm text-ink-2">
          This page couldn&apos;t be loaded. Please try again — if it keeps happening,
          the server logs will have the detail.
        </p>
        {error?.digest && (
          <p className="mt-3 font-mono text-[11px] text-ink-3">Reference: {error.digest}</p>
        )}
        <button onClick={reset} className="btn btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}

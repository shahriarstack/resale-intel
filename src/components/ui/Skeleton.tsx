"use client";

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function SkeletonRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="skeleton h-4 flex-1" style={{ maxWidth: `${60 + (i % 3) * 15}%` }} />
          <div className="skeleton h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ cols = 5, rows = 6 }: { cols?: number; rows?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-rule-strong bg-surface-2 px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: cols }).map((_, i) => (
            <div key={i} className="skeleton h-3" style={{ width: `${60 + (i * 20) % 80}px` }} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-rule">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-6 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, j) => (
              <div key={j} className="skeleton h-4" style={{ width: `${50 + ((i + j) * 17) % 90}px` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="skeleton h-5 w-32" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton h-6 w-12 rounded-full" />
          </div>
          <div className="mt-5 space-y-2">
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-3/4" />
            <div className="skeleton h-3 w-1/2" />
          </div>
          <div className="mt-5 flex justify-between border-t border-rule pt-4">
            <div className="skeleton h-6 w-24" />
            <div className="skeleton h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Wrench, CheckCircle2, Search } from "lucide-react";
import type { VehicleStatus } from "@prisma/client";
import { Chip } from "@/components/ui/Chip";
import { STATUS_META } from "@/lib/status";
import { vehicleTitle } from "@/lib/vehicle";

export interface EngineerVehicle {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  status: VehicleStatus;
  capturedBy: { name: string } | null;
  territory: { name: string } | null;
}

export function EngineerInbox({
  pending,
  recent,
}: {
  pending: EngineerVehicle[];
  recent: EngineerVehicle[];
}) {
  const [tab, setTab] = useState<"pending" | "recent">("pending");
  const [search, setSearch] = useState("");
  const raw = tab === "pending" ? pending : recent;

  const list = useMemo(() => {
    if (!search.trim()) return raw;
    const q = search.toLowerCase();
    return raw.filter(
      (v) =>
        v.registrationNo.toLowerCase().includes(q) ||
        (v.make ?? "").toLowerCase().includes(q) ||
        (v.model ?? "").toLowerCase().includes(q),
    );
  }, [raw, search]);

  return (
    <div className="mx-auto max-w-lg px-5 py-6">
      <header className="mb-5">
        <div className="eyebrow text-accent">Service engineering</div>
        <h1 className="page-title mt-1 text-[28px]">Your assessments</h1>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2.5">
        <Stat label="Awaiting you" value={pending.length} tone="accent" />
        <Stat label="Submitted" value={recent.length} />
      </div>

      {(pending.length + recent.length) > 4 && (
        <div className="search-bar mb-4">
          <Search size={16} />
          <input
            className="field text-sm"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicles…"
          />
        </div>
      )}

      <div className="mb-4 flex gap-5 border-b border-rule">
        <Tab label={`Pending (${pending.length})`} on={tab === "pending"} onClick={() => setTab("pending")} />
        <Tab label={`Submitted (${recent.length})`} on={tab === "recent"} onClick={() => setTab("recent")} />
      </div>

      {list.length === 0 ? (
        <div className="card grid place-items-center gap-2 px-6 py-14 text-center" style={{ animation: "fadeIn 0.2s ease" }}>
          <div className="grid h-14 w-14 place-items-center rounded-full bg-surface-2">
            <CheckCircle2 size={28} className="text-ink-3" strokeWidth={1.6} />
          </div>
          <p className="text-sm font-medium text-ink-2">
            {search.trim()
              ? "No vehicles match your search."
              : tab === "pending"
                ? "All caught up — no pending assessments."
                : "Nothing submitted yet."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((v, i) => (
            <Link
              key={v.id}
              href={`/vehicles/${v.id}`}
              className="card card-hover flex items-center justify-between gap-3 p-4"
              style={{ animation: `slideUp 0.2s ease ${i * 0.03}s both` }}
            >
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-ink">
                  {vehicleTitle(v)}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-ink-3">
                  {v.registrationNo} · {v.territory?.name ?? "—"}
                </p>
              </div>
              {tab === "pending" ? (
                <span className="btn btn-primary btn-sm shrink-0">
                  <Wrench size={14} /> Assess
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  <Chip tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</Chip>
                  <ChevronRight size={16} className="text-ink-3" />
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "accent" }) {
  return (
    <div className="stat-card">
      <div className="font-display text-2xl font-bold leading-none tnum" style={tone === "accent" ? { color: "var(--accent)" } : { color: "var(--ink)" }}>
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-ink-3">{label}</div>
    </div>
  );
}

function Tab({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors"
      style={on ? { borderColor: "var(--accent)", color: "var(--accent)" } : { borderColor: "transparent", color: "var(--ink-3)" }}
    >
      {label}
    </button>
  );
}

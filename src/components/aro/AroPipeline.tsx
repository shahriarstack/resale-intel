"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Lock,
  Loader2,
  ChevronRight,
  Send,
  LogOut,
  Search,
  AlertTriangle,
  Truck,
  SlidersHorizontal,
  LayoutGrid,
  Rows3,
  X,
  ClipboardList,
  Hourglass,
  Store,
  type LucideIcon,
} from "lucide-react";
import type { LetterStage, VehicleStatus } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { LETTER_META, STATUS_META } from "@/lib/status";
import { vehicleTitle } from "@/lib/vehicle";
import { LetterConfirmModal } from "@/components/aro/LetterConfirmModal";

export interface AroVehicle {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  status: VehicleStatus;
  letterStage: LetterStage;
  isLocked: boolean;
  territory: { name: string } | null;
  assignedEngineerId: string | null;
  assignedEngineer: { name: string } | null;
}

interface Engineer {
  id: string;
  name: string;
  staffId: string;
}

const LETTERS: LetterStage[] = ["NONE", "LETTER_1", "LETTER_2", "LETTER_3", "WRITTEN"];

/**
 * The four states a capture can be in from the field team's point of view.
 * Derived from status rather than listed, so a new pipeline status lands in
 * "tracking" by default instead of silently vanishing from every tab.
 */
type TabKey = "active" | "tracking" | "resale" | "released";

function bucketOf(status: VehicleStatus): TabKey {
  if (status === "CAPTURED") return "active";
  if (status === "RELEASED") return "released";
  // Both have reached the marketplace; the chip tells them apart.
  if (status === "LIVE_FOR_RESALE" || status === "SOLD") return "resale";
  return "tracking";
}

const TABS: { key: TabKey; label: string; icon: LucideIcon; tone: string }[] = [
  { key: "active", label: "Active", icon: Truck, tone: "var(--accent)" },
  { key: "tracking", label: "In process", icon: Hourglass, tone: "#6a5acd" },
  { key: "resale", label: "Resale", icon: Store, tone: "var(--ok)" },
  { key: "released", label: "Released", icon: LogOut, tone: "var(--bad)" },
];

export function AroPipeline({
  vehicles,
  engineers,
  totalCaptures,
  capturesLast30,
  capturesPrior30,
}: {
  vehicles: AroVehicle[];
  engineers: Engineer[];
  totalCaptures: number;
  capturesLast30: number;
  capturesPrior30: number;
}) {
  const [tab, setTab] = useState<TabKey>("active");
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [letterFilter, setLetterFilter] = useState<LetterStage | "all">("all");
  const [territoryFilter, setTerritoryFilter] = useState("all");

  // One pass, four buckets — cheaper than four filters and impossible to
  // double-count or drop a status between them.
  const buckets = useMemo(() => {
    const b: Record<TabKey, AroVehicle[]> = {
      active: [],
      tracking: [],
      resale: [],
      released: [],
    };
    for (const v of vehicles) b[bucketOf(v.status)].push(v);
    return b;
  }, [vehicles]);

  const raw = buckets[tab];

  const territories = useMemo(
    () => [...new Set(vehicles.map((v) => v.territory?.name).filter(Boolean) as string[])].sort(),
    [vehicles],
  );

  const list = useMemo(() => {
    let out = raw;
    if (letterFilter !== "all") out = out.filter((v) => v.letterStage === letterFilter);
    if (territoryFilter !== "all") out = out.filter((v) => v.territory?.name === territoryFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (v) =>
          v.registrationNo.toLowerCase().includes(q) ||
          (v.make ?? "").toLowerCase().includes(q) ||
          (v.model ?? "").toLowerCase().includes(q) ||
          (v.territory?.name ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [raw, search, letterFilter, territoryFilter]);

  const filtersOn = letterFilter !== "all" || territoryFilter !== "all";
  const clearFilters = () => {
    setLetterFilter("all");
    setTerritoryFilter("all");
  };

  return (
    <div className="mx-auto max-w-lg px-5 py-5">
      {/* ---- Hero ---- */}
      <section 
        className="hero px-5 py-6 rounded-2xl aura-float relative overflow-hidden" 
        style={{ 
          animation: "fadeIn 0.3s var(--ease-standard)",
          background: "linear-gradient(120deg, #f3f5fa 0%, #fefeff 50%, #f6ebfa 100%)",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)"
        }}
      >
        <div className="relative z-10 max-w-[66%]">
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            Recovery field ops
          </div>
          <h1 className="page-title mt-1 text-[25px]">Your Pipeline</h1>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-2">
            Track, manage and accelerate your recovery actions
          </p>
        </div>
        <HeroArt />
      </section>

      {/* ---- Stats ---- */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <AroStatCard
          icon={<ClipboardList size={15} />}
          label="Total"
          value={totalCaptures}
          caption={`in last 30d`}
          color="#3b82f6"
          sparklinePath="M0,15 Q5,5 10,15 T20,15 T30,15 T40,5 T50,15 T60,15"
        />
        <AroStatCard
          icon={<Truck size={15} />}
          label="Active"
          value={buckets.active.length}
          caption="awaiting you"
          color="#8b5cf6"
          sparklinePath="M0,15 Q10,20 20,10 T40,15 T50,5 T60,15"
        />
        <AroStatCard
          icon={<Hourglass size={15} />}
          label="In process"
          value={buckets.tracking.length}
          caption="other desks"
          color="#f59e0b"
          sparklinePath="M0,5 Q10,15 20,5 T40,10 T50,15 T60,5"
        />
        <AroStatCard
          icon={<LogOut size={15} />}
          label="Released"
          value={buckets.released.length}
          caption="completed"
          color="#10b981"
          sparklinePath="M0,10 Q10,0 20,10 T40,15 T50,5 T60,10"
        />
      </div>

      {/* ---- Search + Filter ---- */}
      <div className="mt-4 flex items-center gap-2.5">
        <div className="flex-1 flex items-center bg-surface px-4 py-2.5 rounded-full border border-rule shadow-[0_2px_10px_rgba(0,0,0,0.02)]">
          <Search size={17} className="text-ink-3 mr-2" />
          <input
            type="text"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model, reg no, location…"
            aria-label="Search vehicles"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="mr-3 grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className="flex h-[42px] items-center gap-1.5 rounded-full border border-rule bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-2"
          style={
            filtersOn || showFilters
              ? { borderColor: "var(--accent)", color: "var(--accent)" }
              : undefined
          }
          aria-expanded={showFilters}
        >
          <SlidersHorizontal size={15} />
          Filter
          {filtersOn && (
            <span
              className="grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {(letterFilter !== "all" ? 1 : 0) + (territoryFilter !== "all" ? 1 : 0)}
            </span>
          )}
        </button>
      </div>

      {/* ---- Filter panel ---- */}
      {showFilters && (
        <div
          className="card mt-2.5 p-3.5 aura-glass"
          style={{ animation: "slideDown 0.2s var(--ease-standard)" }}
        >
          <FilterRow
            label="Letter stage"
            options={[
              { value: "all", label: "All" },
              ...LETTERS.map((l) => ({ value: l, label: LETTER_META[l].label })),
            ]}
            value={letterFilter}
            onChange={(v) => setLetterFilter(v as LetterStage | "all")}
          />
          {territories.length > 1 && (
            <div className="mt-3">
              <FilterRow
                label="Territory"
                options={[
                  { value: "all", label: "All" },
                  ...territories.map((t) => ({ value: t, label: t })),
                ]}
                value={territoryFilter}
                onChange={setTerritoryFilter}
              />
            </div>
          )}
          {filtersOn && (
            <button className="btn btn-ghost btn-sm mt-3" onClick={clearFilters}>
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* ---- Tabs + view toggle ----
          Four buckets do not fit a plain underline row on a phone, so the tabs
          are tone-coloured pills in a scroller. The active tab takes its
          bucket's colour, which doubles as a legend for the cards below. */}
      <div className="no-scrollbar -mx-1 mt-4 flex gap-1.5 overflow-x-auto px-1 py-0.5">
        {TABS.map((t) => (
          <Tab
            key={t.key}
            label={t.label}
            icon={t.icon}
            count={buckets[t.key].length}
            on={tab === t.key}
            onClick={() => setTab(t.key)}
          />
        ))}
      </div>

      {/* The detailed/compact switch only changes anything on Active, where the
          inline letter and engineer controls live — so it only appears there,
          and sits above the list rather than competing with the tabs. */}
      {tab === "active" && list.length > 0 && (
        <div className="mt-3 flex justify-end">
          <div className="flex overflow-hidden rounded-lg border border-rule">
            <ViewBtn on={view === "grid"} onClick={() => setView("grid")} label="Detailed view">
              <LayoutGrid size={14} />
            </ViewBtn>
            <ViewBtn on={view === "list"} onClick={() => setView("list")} label="Compact view" divider>
              <Rows3 size={14} />
            </ViewBtn>
          </div>
        </div>
      )}

      {list.length === 0 ? (
        <Empty tab={tab} hasSearch={!!search.trim() || filtersOn} />
      ) : (
        <div className="mt-3.5 flex flex-col gap-3">
          {list.map((v) =>
            tab === "active" && view === "grid" ? (
              <ActiveCard key={v.id} vehicle={v} engineers={engineers} />
            ) : (
              <CompactCard key={v.id} vehicle={v} />
            ),
          )}
        </div>
      )}

      {/* ---- FAB ---- */}
      <Link href="/capture" className="fab-ext fixed bottom-[88px] right-4 z-20 aura-glow">
        <Plus size={20} strokeWidth={2.6} />
        Add vehicle
      </Link>

      {/* Keeps the last card clear of the floating action button. */}
      <div aria-hidden className="h-16" />
    </div>
  );
}

/** Abstract map artwork for the hero — a tilted plate, a route and a pin. */
function HeroArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 150"
      className="pointer-events-none absolute -right-2 top-1/2 h-[128%] -translate-y-1/2"
      fill="none"
    >
      {/* map plate */}
      <g transform="rotate(-14 100 78)" opacity="0.9">
        <rect x="52" y="40" width="112" height="78" rx="14" fill="rgba(255,255,255,0.62)" />
        <g stroke="rgba(14,80,84,0.14)" strokeWidth="1.5">
          <path d="M52 66h112M52 92h112M84 40v78M118 40v78" />
        </g>
        {/* route */}
        <path
          d="M74 104c14 2 20-10 30-14s22 4 30-10"
          stroke="var(--accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="5 6"
          opacity="0.75"
        />
        <circle cx="74" cy="104" r="5" fill="var(--accent)" opacity="0.28" />
        <circle cx="74" cy="104" r="2.5" fill="var(--accent)" />
      </g>

      {/* pin */}
      <g transform="translate(96 34)">
        <path
          d="M20 0c11 0 20 9 20 20 0 14-20 34-20 34S0 34 0 20C0 9 9 0 20 0z"
          fill="var(--accent)"
        />
        <circle cx="20" cy="20" r="7.5" fill="#fff" />
      </g>

      {/* truck badge */}
      <g transform="translate(150 20)">
        <rect width="40" height="40" rx="13" fill="rgba(255,255,255,0.92)" />
        <g transform="translate(9 11)" stroke="var(--accent)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 3h11v11H1zM12 6.5h4.5L21 10v4h-9" />
          <circle cx="5" cy="16" r="2" fill="none" />
          <circle cx="16" cy="16" r="2" fill="none" />
        </g>
      </g>
    </svg>
  );
}

function ActiveCard({ vehicle, engineers }: { vehicle: AroVehicle; engineers: Engineer[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "RELEASE" | "REQUEST_CN">(null);
  // A letter change is buffered here until the officer confirms it in the
  // modal — the select never commits directly to the API.
  const [pendingLetter, setPendingLetter] = useState<LetterStage | null>(null);
  const locked = vehicle.isLocked;

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await sendJSON(`/api/vehicles/${vehicle.id}`, "PATCH", body);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "bad");
    } finally {
      setBusy(false);
    }
  };

  const requestLetter = (next: LetterStage) => {
    if (next === vehicle.letterStage) return;
    setPendingLetter(next);
  };

  const commitLetter = async () => {
    if (!pendingLetter) return;
    const target = pendingLetter;
    await patch({ letterStage: target });
    toast(`Letter set to ${LETTER_META[target].label}`);
    setPendingLetter(null);
  };

  return (
    <article className="card card-hover p-3.5 aura-glass transition-all duration-300 hover:scale-[1.02]">
      {/* Grid, not flex: the meta row spans the title + chip columns so the
          registration and territory never get squeezed by a long letter chip. */}
      <Link
        href={`/vehicles/${vehicle.id}`}
        className="mb-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-x-2.5"
      >
        <span
          className="row-span-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{
            background: "linear-gradient(155deg, rgba(214,240,229,0.95), rgba(240,252,246,0.8))",
            color: "var(--accent)",
          }}
        >
          <Truck size={17} />
        </span>

        <h3 className="col-start-2 row-start-1 truncate font-display text-[16px] font-bold leading-tight text-ink">
          {vehicleTitle(vehicle)}
        </h3>

        <span className="col-start-3 row-start-1 shrink-0">
          <Chip tone={LETTER_META[vehicle.letterStage].tone}>
            {locked && <Lock size={10} />}
            {LETTER_META[vehicle.letterStage].label}
          </Chip>
        </span>

        <p className="col-span-2 col-start-2 row-start-2 mt-0.5 truncate font-mono text-[11px] text-ink-3">
          {vehicle.registrationNo} · {vehicle.territory?.name ?? "—"}
        </p>
      </Link>

      <div className="grid grid-cols-2 gap-2 border-t border-rule pt-3">
        <div className="relative rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-ink-3">
            Letter
          </div>
          <div className="font-semibold text-[13px] text-ink">{LETTER_META[vehicle.letterStage].label}</div>
          <select
            className="absolute inset-0 opacity-0 cursor-pointer"
            value={vehicle.letterStage}
            disabled={busy || locked}
            onChange={(e) => requestLetter(e.target.value as LetterStage)}
          >
            {LETTERS.map((l) => (
              <option key={l} value={l}>{LETTER_META[l].label}</option>
            ))}
          </select>
          <ChevronRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-ink-3" />
        </div>
        
        <div className="relative rounded-lg bg-surface-2 p-2">
          <div className="mb-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-ink-3">
            Engineer
          </div>
          <div className="font-semibold text-[13px] text-ink">{vehicle.assignedEngineer?.name || "Unassigned"}</div>
          <select
            className="absolute inset-0 opacity-0 cursor-pointer"
            value={vehicle.assignedEngineerId ?? ""}
            disabled={busy || locked}
            onChange={(e) => patch({ assignedEngineerId: e.target.value })}
          >
            <option value="" disabled>Select…</option>
            {engineers.map((eng) => (
              <option key={eng.id} value={eng.id}>{eng.name}</option>
            ))}
          </select>
          <ChevronRight size={12} className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-ink-3" />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold transition-transform active:scale-95"
          style={{ background: "var(--bad-soft)", color: "var(--bad)" }}
          disabled={busy}
          onClick={() => setConfirm("RELEASE")}
        >
          <LogOut size={14} /> Release
        </button>
        <button
          className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-white transition-transform active:scale-95"
          style={{
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
            boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
          }}
          disabled={busy}
          onClick={() => setConfirm("REQUEST_CN")}
        >
          <Send size={14} /> Request CN
        </button>
      </div>

      <ActionConfirm
        open={confirm !== null}
        kind={confirm ?? "RELEASE"}
        vehicle={vehicle}
        onClose={() => setConfirm(null)}
        onDone={() => {
          setConfirm(null);
          router.refresh();
        }}
      />

      {pendingLetter !== null && (
        <LetterConfirmModal
          open
          from={vehicle.letterStage}
          to={pendingLetter}
          vehicleName={vehicleTitle(vehicle)}
          registrationNo={vehicle.registrationNo}
          onCancel={() => setPendingLetter(null)}
          onConfirm={commitLetter}
          busy={busy}
        />
      )}
    </article>
  );
}

/**
 * The compact row: used for every tracking file, and for active files when the
 * officer switches to the compact view. The rail takes the status tone so the
 * desk holding the file is readable from the edge colour alone.
 */
function CompactCard({ vehicle }: { vehicle: AroVehicle }) {
  const meta = STATUS_META[vehicle.status];
  const rail = toneColor(meta.tone);

  return (
    <Link
      href={`/vehicles/${vehicle.id}`}
      className="card card-hover grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-2.5 p-3 aura-glass transition-all duration-300 hover:scale-[1.02]"
    >
      <span
        className="row-span-2 grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ background: toneSoft(meta.tone), color: rail }}
      >
        <Truck size={16} />
      </span>

      <h3 className="col-start-2 row-start-1 truncate font-display text-[15px] font-bold leading-tight text-ink">
        {vehicleTitle(vehicle)}
      </h3>
      <span className="col-start-3 row-start-1 shrink-0">
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </span>
      <ChevronRight size={15} className="col-start-4 row-span-2 shrink-0 text-ink-3" />

      {/* Meta spans the title + chip columns so the registration never clips. */}
      <p className="col-span-2 col-start-2 row-start-2 mt-0.5 truncate font-mono text-[11px] text-ink-3">
        {vehicle.registrationNo}
        {meta.heldBy !== "—" && ` · with ${meta.heldBy}`}
      </p>
    </Link>
  );
}

function toneColor(tone: string): string {
  switch (tone) {
    case "accent": return "var(--accent)";
    case "ok": return "var(--ok)";
    case "warn": return "var(--warn)";
    case "bad": return "var(--bad)";
    default: return "var(--ink-3)";
  }
}
function toneSoft(tone: string): string {
  switch (tone) {
    case "accent": return "var(--accent-soft)";
    case "ok": return "var(--ok-soft)";
    case "warn": return "var(--warn-soft)";
    case "bad": return "var(--bad-soft)";
    default: return "var(--surface-3)";
  }
}

function ActionConfirm({
  open,
  kind,
  vehicle,
  onClose,
  onDone,
}: {
  open: boolean;
  kind: "RELEASE" | "REQUEST_CN";
  vehicle: AroVehicle;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isRelease = kind === "RELEASE";
  const titleId = "action-confirm-title";

  const go = async () => {
    if (isRelease && !note.trim()) {
      setError("A reason is required to release the vehicle.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicle.id}/transition`, "POST", { action: kind, note });
      // Reset local state for the next open — the panel is reused across cards.
      setNote("");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (busy) return;
        setError("");
        setNote("");
        onClose();
      }}
      variant="mobile"
      size="md"
      labelledBy={titleId}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId={titleId}
        title={isRelease ? "Release to customer" : "Request Credit Note"}
        subtitle={`${vehicleTitle(vehicle)} · ${vehicle.registrationNo}`}
        icon={isRelease ? <LogOut size={17} /> : <Send size={17} />}
        tone={isRelease ? "bad" : "accent"}
        onClose={busy ? undefined : onClose}
      />

      <ModalBody>
        <div
          className="rounded-lg border px-3 py-2.5 text-[13px] leading-relaxed"
          style={
            isRelease
              ? {
                  borderColor: "var(--bad)",
                  background: "var(--bad-soft)",
                  color: "var(--bad)",
                }
              : {
                  borderColor: "var(--rule-strong)",
                  background: "var(--surface-2)",
                  color: "var(--ink-2)",
                }
          }
        >
          {isRelease ? (
            <div className="flex items-start gap-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span className="font-medium">
                The vehicle leaves the pipeline permanently. This action cannot be reversed —
                capture it again from scratch if the vehicle is re-recovered.
              </span>
            </div>
          ) : (
            "Sends the file to the Recovery Manager for Credit Note approval. You can add context — territory, buyer interest, timing — to help their review."
          )}
        </div>

        <label className="label mb-1.5 mt-4 block">
          Reason
          {isRelease ? (
            <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--bad)" }}>
              required
            </span>
          ) : (
            <span className="ml-1 text-[10px] font-normal normal-case text-ink-3">optional</span>
          )}
        </label>
        <textarea
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            if (error) setError("");
          }}
          placeholder={
            isRelease
              ? "Why is this vehicle being released?"
              : "Territory, buyer interest, timing…"
          }
          autoFocus
          maxLength={1000}
        />
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[10px] text-ink-3">
            {isRelease ? "This reason is recorded on the audit trail." : ""}
          </span>
          <span className="font-mono text-[10px] tnum text-ink-3">{note.length}/1000</span>
        </div>

        {error && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2 text-xs font-medium text-bad"
            style={{ animation: "scaleIn 0.15s ease" }}
          >
            <AlertTriangle size={13} className="mt-px shrink-0" />
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          className={`btn ${isRelease ? "btn-danger" : "btn-primary"}`}
          onClick={go}
          disabled={busy}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" />
          ) : isRelease ? (
            "Confirm release"
          ) : (
            "Request Credit Note"
          )}
        </button>
      </ModalFooter>
    </Modal>
  );
}

function Tab({
  label,
  icon: Icon,
  count,
  on,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  count: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors duration-150"
      style={
        on
          ? {
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.25)"
            }
          : {
              background: "var(--surface)",
              color: "var(--ink-3)",
              border: "1px solid var(--rule)"
            }
      }
    >
      <Icon size={14} strokeWidth={on ? 2.4 : 1.9} />
      {label}
      <span
        className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 font-mono text-[10px] font-bold"
        style={
          on
            ? { background: "rgba(255,255,255,0.25)", color: "#fff" }
            : { background: "var(--surface-3)", color: "var(--ink-3)" }
        }
      >
        {count}
      </span>
    </button>
  );
}

function ViewBtn({
  on,
  onClick,
  label,
  divider,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid h-8 w-8 place-items-center transition-colors ${divider ? "border-l border-rule" : ""}`}
      style={
        on
          ? { background: "var(--accent-soft)", color: "var(--accent-ink)" }
          : { background: "transparent", color: "var(--ink-3)" }
      }
    >
      {children}
    </button>
  );
}

function AroStatCard({
  icon,
  label,
  value,
  caption,
  color,
  sparklinePath,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  caption: string;
  color: string;
  sparklinePath: string;
}) {
  return (
    <div className="card aura-glass relative flex flex-col overflow-hidden p-3.5 pb-8 transition-transform duration-300 hover:scale-[1.03]">
      <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)`, color }}>
        {icon}
      </div>
      <div className="font-mono text-[9px] font-bold uppercase tracking-widest text-ink-3">
        {label}
      </div>
      <div className="mt-0.5 font-display text-2xl font-bold leading-none text-ink">
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] text-ink-3">{caption}</div>
      
      {/* Decorative Sparkline */}
      <svg
        className="absolute bottom-0 left-0 right-0 h-6 w-full opacity-60"
        viewBox="0 0 60 20"
        preserveAspectRatio="none"
      >
        <path
          d={sparklinePath}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d={`${sparklinePath} L60,20 L0,20 Z`}
          fill={`color-mix(in srgb, ${color} 10%, transparent)`}
          stroke="none"
        />
      </svg>
    </div>
  );
}

/** A horizontal scroller of selectable pills — used inside the filter panel. */
function FilterRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="label mb-2">{label}</div>
      <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => onChange(o.value)}
              className="shrink-0 rounded-full px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors"
              style={
                on
                  ? { background: "var(--accent)", color: "var(--on-accent)" }
                  : { background: "var(--surface-2)", color: "var(--ink-2)" }
              }
              aria-pressed={on}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const EMPTY_COPY: Record<TabKey, string> = {
  active: "No active captures yet — tap Add vehicle to start one.",
  tracking: "Nothing in progress at other desks right now.",
  resale: "None of your captures have reached the marketplace yet.",
  released: "You haven't released any vehicle back to a customer.",
};

function Empty({ tab, hasSearch }: { tab: TabKey; hasSearch: boolean }) {
  const meta = TABS.find((t) => t.key === tab)!;
  const Icon = meta.icon;
  return (
    <div
      className="card mt-3.5 grid place-items-center gap-2.5 px-6 py-12 text-center"
      style={{ animation: "fadeIn 0.28s var(--ease-standard)" }}
    >
      <span
        className="grid h-11 w-11 place-items-center rounded-2xl"
        style={{
          background: `color-mix(in srgb, ${meta.tone} 10%, var(--surface-2))`,
          color: meta.tone,
        }}
      >
        <Icon size={20} strokeWidth={1.6} />
      </span>
      <p className="text-[13px] font-medium text-ink-2">
        {hasSearch ? "No vehicles match your search or filters." : EMPTY_COPY[tab]}
      </p>
    </div>
  );
}

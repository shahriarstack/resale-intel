"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  MapPin,
  Warehouse,
  ListChecks,
  Pencil,
  Check,
  X,
  EyeOff,
  Truck,
  CornerDownRight,
} from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import type { TerritoryMap } from "@/lib/territoryMap";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";

interface Location { id: string; name: string; type: string; isActive: boolean }
interface Question { id: string; key: string; label: string; requiresNote: boolean; sortOrder: number; isActive: boolean }
interface VehicleModel { id: string; name: string; isActive: boolean; sortOrder: number }
interface Brand { id: string; name: string; isActive: boolean; sortOrder: number; models: VehicleModel[] }

export default function MasterDataPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-7 lg:px-8">
      <header className="mb-6" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">Administration</div>
        <h1 className="page-title mt-1 text-[28px]">Master data</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          Vehicle brands, territories, locations and the capture checklist. Hidden items stay on
          existing records but disappear from the capture form.
        </p>
      </header>

      <div className="space-y-4">
        <BrandSection />
        <TerritorySection />
        <LocationSection />
        <QuestionSection />
      </div>
    </div>
  );
}

function useList<T>(url: string) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setItems(await getJSON<T[]>(url));
  };
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getJSON<T[]>(url);
        if (active) setItems(data);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [url]);
  return { items, loading, load };
}

function Card({
  icon,
  title,
  subtitle,
  count,
  hidden,
  showHidden,
  onToggleHidden,
  delay,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  count: number;
  hidden: number;
  showHidden: boolean;
  onToggleHidden: () => void;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="card p-4"
      style={{ animation: `fadeIn 0.28s var(--ease-standard) ${delay}s both` }}
    >
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {icon}
          </span>
          <div>
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-ink">
              {title}
              {count > 0 && (
                <span
                  className="count-badge"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  {count}
                </span>
              )}
            </h2>
            <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>
          </div>
        </div>

        {hidden > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={onToggleHidden}
            style={showHidden ? { borderColor: "var(--accent)", color: "var(--accent)" } : undefined}
          >
            <EyeOff size={13} /> {hidden} hidden
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Rows({ children }: { children: React.ReactNode }) {
  return <div className="divide-y divide-rule overflow-hidden rounded-lg border border-rule">{children}</div>;
}

/** One row, with inline rename. `onRename` receives the new display value. */
function Row({
  main,
  sub,
  active,
  editable = true,
  onRename,
  onToggle,
  onDelete,
  extra,
}: {
  main: string;
  sub?: React.ReactNode;
  active: boolean;
  editable?: boolean;
  onRename: (value: string) => Promise<void>;
  onToggle: () => void;
  onDelete: () => void;
  /** Optional control shown before the status chip — e.g. a territory's part. */
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(main);
  const [busy, setBusy] = useState(false);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === main) {
      setEditing(false);
      setDraft(main);
      return;
    }
    setBusy(true);
    try {
      await onRename(next);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(main);
    setEditing(false);
  };

  return (
    <div
      className="group flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-surface-2"
      style={{ opacity: active ? 1 : 0.55 }}
    >
      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <input
              className="field text-sm"
              value={draft}
              autoFocus
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") cancel();
              }}
            />
            <button
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ok transition-colors hover:bg-surface-3"
              onClick={commit}
              disabled={busy}
              aria-label="Save"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} />}
            </button>
            <button
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-3"
              onClick={cancel}
              disabled={busy}
              aria-label="Cancel"
            >
              <X size={15} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{main}</span>
              {editable && (
                <button
                  className="grid h-6 w-6 shrink-0 place-items-center rounded text-ink-3 opacity-40 transition-[opacity,color] duration-150 hover:text-accent focus:opacity-100 group-hover:opacity-100"
                  onClick={() => setEditing(true)}
                  aria-label={`Rename ${main}`}
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
            {sub && <div className="font-mono text-[11px] text-ink-3">{sub}</div>}
          </>
        )}
      </div>

      {!editing && (
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          {active ? <Chip tone="ok">Active</Chip> : <Chip tone="neutral">Hidden</Chip>}
          <button className="btn btn-ghost btn-sm" onClick={onToggle}>
            {active ? "Hide" : "Show"}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:text-bad"
            onClick={onDelete}
            aria-label={`Delete ${main}`}
          >
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * The two maps, read rather than maintained.
 *
 * This used to be an add/rename/hide list, and the list was the problem: a
 * patch could sit in it for a year with nobody posted to it and nothing said
 * so, while an officer could be posted to a patch nobody had ever classified.
 * Two records of the same fact, free to disagree.
 *
 * Both halves are now DERIVED FROM THE ROSTER, which is the thing that is
 * true. A recovery patch exists because an officer is posted to it; a sales
 * patch exists because a sales officer is assigned to it. Everything here is
 * set in the users console, so this panel leads with the EXCEPTIONS — the
 * patches nobody works and the ones nobody has put in a part — because that is
 * the only thing a reader can act on.
 *
 * Recovery and sales are shown side by side and never merged. They are
 * different organisations drawing different maps; a name appearing in both is
 * a coincidence, and joining on it would invent a relationship the business
 * does not have.
 */
function TerritorySection() {
  const [map, setMap] = useState<TerritoryMap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const data = await getJSON<TerritoryMap>("/api/admin/territory-map");
        if (alive) setMap(data);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const t = map?.totals;

  return (
    <Card
      icon={<MapPin size={17} />}
      title="Territories"
      subtitle="Derived from the roster — post an officer in Users and their patch appears here."
      count={(map?.totals.recovery ?? 0) + (map?.totals.sales ?? 0)}
      hidden={0}
      showHidden
      onToggleHidden={() => {}}
      delay={0.04}
    >
      {loading && <p className="text-[13px] text-ink-3">Reading the roster…</p>}

      {map && (
        <>
          {/* The exceptions, first and in plain language. */}
          {t && (t.recoveryUnstaffed > 0 || t.recoveryUnparted > 0) && (
            <div className="td-flags">
              {t.recoveryUnstaffed > 0 && (
                <span className="td-flag td-flag-warn">
                  {t.recoveryUnstaffed} recovery patch
                  {t.recoveryUnstaffed === 1 ? "" : "es"} with nobody posted
                </span>
              )}
              {t.recoveryUnparted > 0 && (
                <span className="td-flag">
                  {t.recoveryUnparted} not in a part
                </span>
              )}
            </div>
          )}

          <div className="td-maps">
            {/* ---- Recovery ------------------------------------------- */}
            <div className="td-map">
              <div className="td-map-head">
                <span className="td-map-title">Recovery</span>
                <span className="td-map-count">{map.recovery.length}</span>
              </div>
              {map.recovery.length === 0 && (
                <p className="td-none">
                  None yet. Post a Recovery Team officer to a patch in Users and it appears
                  here.
                </p>
              )}
              {map.recovery.map((r) => (
                <div key={r.id} className="td-row" data-warn={r.unstaffed || undefined}>
                  <div className="td-row-main">
                    <span className="td-name">{r.name}</span>
                    {r.part ? (
                      <span className="td-part">Part {r.part}</span>
                    ) : (
                      <span className="td-part td-part-none">No part</span>
                    )}
                    {!r.isActive && <span className="td-part td-part-none">Hidden</span>}
                  </div>
                  <div className="td-row-sub">
                    {r.unstaffed ? (
                      <span className="td-warn">Nobody posted</span>
                    ) : (
                      <>
                        {r.officers.map((o) => (
                          <span
                            key={o.id}
                            className="td-officer"
                            data-cover={o.kind === "COVER" || undefined}
                            title={o.kind === "BASE" ? "Based here" : "Covering"}
                          >
                            {o.name}
                          </span>
                        ))}
                        {r.coveredOnly && <span className="td-warn">covered only</span>}
                      </>
                    )}
                    {r.vehicles > 0 && (
                      <span className="td-count">{r.vehicles} vehicle{r.vehicles === 1 ? "" : "s"}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* ---- Sales ---------------------------------------------- */}
            <div className="td-map">
              <div className="td-map-head">
                <span className="td-map-title">Sales</span>
                <span className="td-map-count">{map.sales.length}</span>
              </div>
              {map.sales.length === 0 && (
                <p className="td-none">
                  None yet. Give a Sales Team officer a sales territory in Users.
                </p>
              )}
              {map.sales.map((s) => (
                <div key={s.name} className="td-row">
                  <div className="td-row-main">
                    <span className="td-name">{s.name}</span>
                  </div>
                  <div className="td-row-sub">
                    {s.officers.map((o) => (
                      <span key={o.id} className="td-officer">
                        {o.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}


function LocationSection() {
  const { toast } = useToast();
  const { items, loading, load } = useList<Location>("/api/admin/locations");
  const [name, setName] = useState("");
  const [type, setType] = useState("YARD");
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(true);

  const hidden = items.filter((l) => !l.isActive).length;
  const visible = useMemo(
    () => (showHidden ? items : items.filter((l) => l.isActive)),
    [items, showHidden],
  );

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await sendJSON("/api/admin/locations", "POST", { name, type });
      toast(`Location "${name}" added`);
      setName("");
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    finally { setBusy(false); }
  };
  const rename = async (l: Location, value: string) => {
    try {
      await sendJSON(`/api/admin/locations/${l.id}`, "PATCH", { name: value });
      toast(`Renamed to "${value}"`);
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Rename failed", "bad"); }
  };
  const toggle = async (l: Location) => {
    await sendJSON(`/api/admin/locations/${l.id}`, "PATCH", { isActive: !l.isActive });
    toast(`${l.name} ${l.isActive ? "hidden" : "shown"}`);
    await load();
  };
  const del = async (l: Location) => {
    if (confirm(`Delete location "${l.name}"?`)) {
      try {
        await sendJSON(`/api/admin/locations/${l.id}`, "DELETE");
        toast(`Location "${l.name}" deleted`);
        await load();
      } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    }
  };

  return (
    <Card
      icon={<Warehouse size={17} />}
      title="Locations"
      subtitle="Yards, depots and showrooms a recovered vehicle can sit at."
      count={items.length}
      hidden={hidden}
      showHidden={showHidden}
      onToggleHidden={() => setShowHidden(!showHidden)}
      delay={0.08}
    >
      <div className="mb-4 flex gap-2">
        <input className="field" placeholder="Location name" aria-label="New location name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <select className="field w-36" aria-label="Location type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="YARD">Yard</option>
          <option value="DEPOT">Depot</option>
          <option value="SHOWROOM">Showroom</option>
          <option value="CUSTOMER">With customer</option>
          <option value="OTHER">Other</option>
        </select>
        <button className="btn btn-primary shrink-0" onClick={add} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>
      {loading ? <SkeletonBlock /> : visible.length === 0 ? <Empty hidden={hidden > 0 && !showHidden} /> : (
        <Rows>
          {visible.map((l) => (
            <Row
              key={l.id}
              main={l.name}
              sub={l.type}
              active={l.isActive}
              onRename={(v) => rename(l, v)}
              onToggle={() => toggle(l)}
              onDelete={() => del(l)}
            />
          ))}
        </Rows>
      )}
    </Card>
  );
}

/**
 * Brands, and the models under each.
 *
 * Nested rather than two flat lists: a model only means anything inside its
 * brand, and an admin adding "Aumark S" is always thinking "…to Foton". Two
 * sibling tables would make them pick the brand twice, once to find the model
 * and once to file it.
 */
function BrandSection() {
  const { toast } = useToast();
  const { items, loading, load } = useList<Brand>("/api/admin/brands");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(true);

  const hidden = items.filter((b) => !b.isActive).length;
  const visible = useMemo(
    () => (showHidden ? items : items.filter((b) => b.isActive)),
    [items, showHidden],
  );
  const modelCount = items.reduce((n, b) => n + b.models.length, 0);

  const fail = (e: unknown, fallback: string) =>
    toast(e instanceof Error ? e.message : fallback, "bad");

  const addBrand = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await sendJSON("/api/admin/brands", "POST", { name });
      setName("");
      toast(`Brand "${name}" added`);
      await load();
    } catch (e) { fail(e, "Failed"); }
    finally { setBusy(false); }
  };

  const renameBrand = async (b: Brand, value: string) => {
    try {
      await sendJSON(`/api/admin/brands/${b.id}`, "PATCH", { name: value });
      toast(`Renamed to "${value}"`);
      await load();
    } catch (e) { fail(e, "Rename failed"); }
  };

  const toggleBrand = async (b: Brand) => {
    try {
      await sendJSON(`/api/admin/brands/${b.id}`, "PATCH", { isActive: !b.isActive });
      toast(`${b.name} ${b.isActive ? "hidden" : "shown"}`);
      await load();
    } catch (e) { fail(e, "Failed"); }
  };

  const delBrand = async (b: Brand) => {
    const warning = b.models.length
      ? `Delete brand "${b.name}" and its ${b.models.length} model${b.models.length === 1 ? "" : "s"}?\n\nVehicles already captured keep the brand recorded on them.`
      : `Delete brand "${b.name}"?`;
    if (!confirm(warning)) return;
    try {
      await sendJSON(`/api/admin/brands/${b.id}`, "DELETE");
      toast(`Brand "${b.name}" deleted`);
      await load();
    } catch (e) { fail(e, "Failed"); }
  };

  const addModel = async (brandId: string, modelName: string) => {
    await sendJSON("/api/admin/models", "POST", { brandId, name: modelName });
    await load();
  };

  const renameModel = async (m: VehicleModel, value: string) => {
    try {
      await sendJSON(`/api/admin/models/${m.id}`, "PATCH", { name: value });
      toast(`Renamed to "${value}"`);
      await load();
    } catch (e) { fail(e, "Rename failed"); }
  };

  const toggleModel = async (m: VehicleModel) => {
    try {
      await sendJSON(`/api/admin/models/${m.id}`, "PATCH", { isActive: !m.isActive });
      await load();
    } catch (e) { fail(e, "Failed"); }
  };

  const delModel = async (m: VehicleModel) => {
    if (!confirm(`Delete model "${m.name}"?`)) return;
    try {
      await sendJSON(`/api/admin/models/${m.id}`, "DELETE");
      toast(`Model "${m.name}" deleted`);
      await load();
    } catch (e) { fail(e, "Failed"); }
  };

  return (
    <Card
      icon={<Truck size={17} />}
      title="Brands & models"
      subtitle="The vehicle brand and model dropdowns on the capture form."
      count={items.length}
      hidden={hidden}
      showHidden={showHidden}
      onToggleHidden={() => setShowHidden(!showHidden)}
      delay={0.02}
    >
      <div className="mb-4 flex gap-2">
        <input
          className="field"
          placeholder="Brand name"
          aria-label="New brand name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addBrand()}
        />
        <button className="btn btn-primary shrink-0" onClick={addBrand} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>

      {modelCount > 0 && (
        <p className="mb-3 font-mono text-[11px] text-ink-3">
          {modelCount} model{modelCount === 1 ? "" : "s"} across {items.length} brand
          {items.length === 1 ? "" : "s"}
        </p>
      )}

      {loading ? <SkeletonBlock /> : visible.length === 0 ? <Empty hidden={hidden > 0 && !showHidden} /> : (
        <div className="space-y-2">
          {visible.map((b, i) => (
            <BrandRow
              key={b.id}
              brand={b}
              index={i}
              onRename={(v) => renameBrand(b, v)}
              onToggle={() => toggleBrand(b)}
              onDelete={() => delBrand(b)}
              onAddModel={(n) => addModel(b.id, n)}
              onRenameModel={renameModel}
              onToggleModel={toggleModel}
              onDeleteModel={delModel}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function BrandRow({
  brand,
  index,
  onRename,
  onToggle,
  onDelete,
  onAddModel,
  onRenameModel,
  onToggleModel,
  onDeleteModel,
}: {
  brand: Brand;
  index: number;
  onRename: (v: string) => Promise<void>;
  onToggle: () => void;
  onDelete: () => void;
  onAddModel: (name: string) => Promise<void>;
  onRenameModel: (m: VehicleModel, v: string) => Promise<void>;
  onToggleModel: (m: VehicleModel) => void;
  onDeleteModel: (m: VehicleModel) => void;
}) {
  const { toast } = useToast();
  // Brands open by default when they have no models — an empty brand is the
  // one that needs attention, so hiding its input behind a click is backwards.
  const [open, setOpen] = useState(brand.models.length === 0);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const submitModel = async () => {
    const value = draft.trim();
    if (!value) return;
    setAdding(true);
    try {
      await onAddModel(value);
      setDraft("");
      toast(`Model "${value}" added to ${brand.name}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "bad");
    } finally {
      setAdding(false);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-lg border border-rule"
      style={{
        opacity: brand.isActive ? 1 : 0.6,
        animation: `fadeIn 0.2s var(--ease-standard) ${Math.min(index, 8) * 0.02}s both`,
      }}
    >
      <div className="bg-surface-2">
        <Row
          main={brand.name}
          sub={`${brand.models.length} model${brand.models.length === 1 ? "" : "s"}`}
          active={brand.isActive}
          onRename={onRename}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      </div>

      <button
        type="button"
        className="flex w-full items-center gap-1.5 border-t border-rule px-4 py-1.5 text-left font-mono text-[10.5px] uppercase tracking-wider text-ink-3 transition-colors hover:bg-surface-2 hover:text-accent"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <CornerDownRight size={11} />
        {open ? "Hide models" : `Models · ${brand.models.length}`}
      </button>

      {open && (
        <div className="border-t border-rule px-3 py-2.5" style={{ animation: "slideDown 0.15s var(--ease-standard)" }}>
          <div className="mb-2 flex gap-2">
            <input
              className="field text-sm"
              placeholder={`New model for ${brand.name}`}
              aria-label={`New model name for ${brand.name}`}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitModel()}
            />
            <button
              className="btn btn-ghost btn-sm shrink-0"
              onClick={submitModel}
              disabled={adding || !draft.trim()}
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>

          {brand.models.length === 0 ? (
            <p className="px-1 py-2 text-xs text-ink-3">
              No models yet. The capture form will offer this brand with an empty model list.
            </p>
          ) : (
            <Rows>
              {brand.models.map((m) => (
                <Row
                  key={m.id}
                  main={m.name}
                  active={m.isActive}
                  onRename={(v) => onRenameModel(m, v)}
                  onToggle={() => onToggleModel(m)}
                  onDelete={() => onDeleteModel(m)}
                />
              ))}
            </Rows>
          )}
        </div>
      )}
    </div>
  );
}

function QuestionSection() {
  const { toast } = useToast();
  const { items, loading, load } = useList<Question>("/api/admin/questions");
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [requiresNote, setRequiresNote] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(true);

  const hidden = items.filter((q) => !q.isActive).length;
  const visible = useMemo(
    () => (showHidden ? items : items.filter((q) => q.isActive)),
    [items, showHidden],
  );

  const add = async () => {
    if (!key.trim() || !label.trim()) return;
    setBusy(true);
    try {
      await sendJSON("/api/admin/questions", "POST", { key: key.toUpperCase(), label, requiresNote, sortOrder: items.length + 1 });
      toast(`Question "${label}" added`);
      setKey(""); setLabel(""); setRequiresNote(false);
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    finally { setBusy(false); }
  };
  const rename = async (q: Question, value: string) => {
    try {
      await sendJSON(`/api/admin/questions/${q.id}`, "PATCH", { label: value });
      toast("Question updated");
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Update failed", "bad"); }
  };
  const toggleNote = async (q: Question) => {
    try {
      await sendJSON(`/api/admin/questions/${q.id}`, "PATCH", { requiresNote: !q.requiresNote });
      toast(q.requiresNote ? "Note no longer required" : "Note now required on “No”");
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Update failed", "bad"); }
  };
  const toggle = async (q: Question) => {
    await sendJSON(`/api/admin/questions/${q.id}`, "PATCH", { isActive: !q.isActive });
    toast(`${q.label} ${q.isActive ? "hidden" : "shown"}`);
    await load();
  };
  const del = async (q: Question) => {
    if (confirm(`Delete question "${q.label}"?`)) {
      try {
        await sendJSON(`/api/admin/questions/${q.id}`, "DELETE");
        toast(`Question deleted`);
        await load();
      } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    }
  };

  return (
    <Card
      icon={<ListChecks size={17} />}
      title="Capture checklist"
      subtitle="Yes / No questions the field team answers for every capture."
      count={items.length}
      hidden={hidden}
      showHidden={showHidden}
      onToggleHidden={() => setShowHidden(!showHidden)}
      delay={0.12}
    >
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <input className="field w-40 font-mono uppercase" placeholder="KEY" aria-label="Question key" value={key} onChange={(e) => setKey(e.target.value)} />
          <input className="field" placeholder="Question label" aria-label="Question label" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="btn btn-primary shrink-0" onClick={add} disabled={busy || !key.trim() || !label.trim()}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={requiresNote} onChange={(e) => setRequiresNote(e.target.checked)} />
          Require a note when answered &ldquo;No&rdquo;
        </label>
      </div>
      {loading ? <SkeletonBlock /> : visible.length === 0 ? <Empty hidden={hidden > 0 && !showHidden} /> : (
        <Rows>
          {visible.map((q) => (
            <Row
              key={q.id}
              main={q.label}
              sub={
                <button
                  onClick={() => toggleNote(q)}
                  className="transition-colors hover:text-accent"
                  title="Toggle whether a note is required"
                >
                  {q.key}
                  {q.requiresNote ? " · note required" : " · no note"}
                </button>
              }
              active={q.isActive}
              onRename={(v) => rename(q, v)}
              onToggle={() => toggle(q)}
              onDelete={() => del(q)}
            />
          ))}
        </Rows>
      )}
    </Card>
  );
}

function SkeletonBlock() {
  return (
    <div className="space-y-3 py-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton mx-4 h-5" style={{ maxWidth: `${70 - i * 10}%` }} />
      ))}
    </div>
  );
}

function Empty({ hidden }: { hidden?: boolean }) {
  return (
    <p className="py-8 text-center text-sm text-ink-3">
      {hidden ? "Everything here is hidden. Switch the filter to see it." : "Nothing yet. Add the first one above."}
    </p>
  );
}

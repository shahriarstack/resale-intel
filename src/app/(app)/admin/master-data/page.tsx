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
} from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { useToast } from "@/components/ui/Toast";

interface Territory { id: string; name: string; code: string | null; isActive: boolean }
interface Location { id: string; name: string; type: string; isActive: boolean }
interface Question { id: string; key: string; label: string; requiresNote: boolean; sortOrder: number; isActive: boolean }

export default function MasterDataPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-7 lg:px-8">
      <header className="mb-6" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">Administration</div>
        <h1 className="page-title mt-1 text-[28px]">Master data</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          Territories, locations and the capture checklist. Hidden items stay on existing records but
          disappear from the capture form.
        </p>
      </header>

      <div className="space-y-4">
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
  index,
}: {
  main: string;
  sub?: React.ReactNode;
  active: boolean;
  editable?: boolean;
  onRename: (value: string) => Promise<void>;
  onToggle: () => void;
  onDelete: () => void;
  index: number;
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

function TerritorySection() {
  const { toast } = useToast();
  const { items, loading, load } = useList<Territory>("/api/admin/territories");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [showHidden, setShowHidden] = useState(true);

  const hidden = items.filter((t) => !t.isActive).length;
  const visible = useMemo(
    () => (showHidden ? items : items.filter((t) => t.isActive)),
    [items, showHidden],
  );

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await sendJSON("/api/admin/territories", "POST", { name, code });
      setName(""); setCode("");
      toast(`Territory "${name}" added`);
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    finally { setBusy(false); }
  };
  const rename = async (t: Territory, value: string) => {
    try {
      await sendJSON(`/api/admin/territories/${t.id}`, "PATCH", { name: value });
      toast(`Renamed to "${value}"`);
      await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Rename failed", "bad"); }
  };
  const toggle = async (t: Territory) => {
    await sendJSON(`/api/admin/territories/${t.id}`, "PATCH", { isActive: !t.isActive });
    toast(`${t.name} ${t.isActive ? "hidden" : "shown"}`);
    await load();
  };
  const del = async (t: Territory) => {
    if (confirm(`Delete territory "${t.name}"?`)) {
      try {
        await sendJSON(`/api/admin/territories/${t.id}`, "DELETE");
        toast(`Territory "${t.name}" deleted`);
        await load();
      } catch (e) { toast(e instanceof Error ? e.message : "Failed", "bad"); }
    }
  };

  return (
    <Card
      icon={<MapPin size={17} />}
      title="Territories"
      subtitle="Sales territories offered on the capture form and user profiles."
      count={items.length}
      hidden={hidden}
      showHidden={showHidden}
      onToggleHidden={() => setShowHidden(!showHidden)}
      delay={0.04}
    >
      <div className="mb-4 flex gap-2">
        <input className="field" placeholder="Territory name" aria-label="New territory name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input className="field w-32" placeholder="Code" aria-label="Territory code (optional)" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-primary shrink-0" onClick={add} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>
      {loading ? <SkeletonBlock /> : visible.length === 0 ? <Empty hidden={hidden > 0 && !showHidden} /> : (
        <Rows>
          {visible.map((t, i) => (
            <Row
              key={t.id}
              index={i}
              main={t.name}
              sub={t.code || undefined}
              active={t.isActive}
              onRename={(v) => rename(t, v)}
              onToggle={() => toggle(t)}
              onDelete={() => del(t)}
            />
          ))}
        </Rows>
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
          <option value="OTHER">Other</option>
        </select>
        <button className="btn btn-primary shrink-0" onClick={add} disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
        </button>
      </div>
      {loading ? <SkeletonBlock /> : visible.length === 0 ? <Empty hidden={hidden > 0 && !showHidden} /> : (
        <Rows>
          {visible.map((l, i) => (
            <Row
              key={l.id}
              index={i}
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
          {visible.map((q, i) => (
            <Row
              key={q.id}
              index={i}
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
      {hidden ? "Everything here is hidden — switch the filter to see it." : "Nothing yet — add the first one above."}
    </p>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Loader2,
  X,
  Users as UsersIcon,
  UserCheck,
  UserX,
  Shield,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertCircle,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { getJSON, sendJSON } from "@/lib/http";
import { ALL_ROLES, ROLE_META } from "@/lib/rbac";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface AdminUser {
  id: string;
  name: string;
  staffId: string;
  designation: string | null;
  role: Role;
  isActive: boolean;
  territoryId: string | null;
  territory: { name: string } | null;
}
interface Territory {
  id: string;
  name: string;
}

const blank = {
  name: "",
  staffId: "",
  designation: "",
  role: "RECOVERY_TEAM" as Role,
  territoryId: "",
  password: "",
  isActive: true,
};

type SortKey = "name" | "staffId" | "role" | "territory";
type StatusFilter = "all" | "active" | "inactive";

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function UsersAdminPage() {
  const { toast } = useToast();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const searchRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const [u, t] = await Promise.all([
      getJSON<AdminUser[]>("/api/admin/users"),
      getJSON<Territory[]>("/api/admin/territories"),
    ]);
    setUsers(u);
    setTerritories(t);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [u, t] = await Promise.all([
          getJSON<AdminUser[]>("/api/admin/users"),
          getJSON<Territory[]>("/api/admin/territories"),
        ]);
        if (active) {
          setUsers(u);
          setTerritories(t);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // "/" focuses search; Escape closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT";
      if (e.key === "/" && !typing && !open) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape" && open && !saving) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saving]);

  const stats = useMemo(() => {
    const active = users.filter((u) => u.isActive).length;
    return {
      total: users.length,
      active,
      inactive: users.length - active,
      roles: new Set(users.map((u) => u.role)).size,
    };
  }, [users]);

  const filtered = useMemo(() => {
    let list = users;

    if (roleFilter !== "all") list = list.filter((u) => u.role === roleFilter);
    if (statusFilter !== "all") {
      const want = statusFilter === "active";
      list = list.filter((u) => u.isActive === want);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.staffId.toLowerCase().includes(q) ||
          ROLE_META[u.role].label.toLowerCase().includes(q) ||
          (u.designation ?? "").toLowerCase().includes(q) ||
          (u.territory?.name ?? "").toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "staffId":
          cmp = a.staffId.localeCompare(b.staffId);
          break;
        case "role":
          cmp = ROLE_META[a.role].label.localeCompare(ROLE_META[b.role].label);
          break;
        case "territory":
          cmp = (a.territory?.name ?? "").localeCompare(b.territory?.name ?? "");
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [users, search, roleFilter, statusFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(blank);
    setError("");
    setOpen(true);
  };
  const openEdit = (u: AdminUser) => {
    setEditing(u);
    setForm({
      name: u.name,
      staffId: u.staffId,
      designation: u.designation ?? "",
      role: u.role,
      territoryId: u.territoryId ?? "",
      password: "",
      isActive: u.isActive,
    });
    setError("");
    setOpen(true);
  };

  const invalid =
    !form.name.trim() || !form.staffId.trim() || (!editing && form.password.length < 6);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        staffId: form.staffId,
        designation: form.designation,
        role: form.role,
        territoryId: form.territoryId || null,
      };
      if (editing) {
        payload.isActive = form.isActive;
        if (form.password) payload.password = form.password;
        await sendJSON(`/api/admin/users/${editing.id}`, "PATCH", payload);
        toast("User updated successfully");
      } else {
        payload.password = form.password;
        await sendJSON("/api/admin/users", "POST", payload);
        toast("User created successfully");
      }
      setOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: AdminUser) => {
    try {
      await sendJSON(`/api/admin/users/${u.id}`, "PATCH", { isActive: !u.isActive });
      toast(`${u.name} ${u.isActive ? "deactivated" : "activated"}`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "bad");
    }
  };

  const remove = async (u: AdminUser) => {
    if (!confirm(`Delete ${u.name} (${u.staffId})? This cannot be undone.`)) return;
    try {
      await sendJSON(`/api/admin/users/${u.id}`, "DELETE");
      toast(`${u.name} deleted`);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "bad");
    }
  };

  const anyFilter = search.trim() !== "" || roleFilter !== "all" || statusFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-7 lg:px-8">
      <header
        className="mb-5 flex flex-wrap items-end justify-between gap-4"
        style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}
      >
        <div>
          <div className="eyebrow text-accent">Administration</div>
          <h1 className="page-title mt-1 text-[28px]">Users</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            Accounts, roles and access across the eight desks.
          </p>
        </div>
        <div className="flex gap-2.5">
          <a href="/api/admin/export" className="btn btn-ghost">
            <Download size={16} /> Export register
          </a>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add user
          </button>
        </div>
      </header>

      {/* Stat strip */}
      <section
        className="card mb-5 overflow-hidden"
        style={{ animation: "fadeIn 0.28s var(--ease-standard) 0.02s both" }}
      >
        <div className="grid grid-cols-2 divide-x divide-y divide-rule lg:grid-cols-4 lg:divide-y-0">
          <StatCell icon={<UsersIcon size={13} />} tone="neutral" label="Total" value={stats.total} />
          <StatCell
            icon={<UserCheck size={13} />}
            tone="ok"
            label="Active"
            value={stats.active}
            onClick={() => setStatusFilter(statusFilter === "active" ? "all" : "active")}
            on={statusFilter === "active"}
          />
          <StatCell
            icon={<UserX size={13} />}
            tone="bad"
            label="Inactive"
            value={stats.inactive}
            onClick={() => setStatusFilter(statusFilter === "inactive" ? "all" : "inactive")}
            on={statusFilter === "inactive"}
          />
          <StatCell
            icon={<Shield size={13} />}
            tone="accent"
            label="Roles"
            value={stats.roles}
            sub={`of ${ALL_ROLES.length}`}
          />
        </div>
      </section>

      {loading ? (
        <SkeletonTable cols={6} rows={6} />
      ) : error && users.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <AlertCircle className="mx-auto mb-3 text-bad" size={28} />
          <p className="text-sm font-medium text-bad">{error}</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div
            className="mb-4 flex flex-wrap items-center gap-2.5"
            style={{ animation: "fadeIn 0.28s var(--ease-standard) 0.06s both" }}
          >
            <SearchBar
              value={search}
              onChange={setSearch}
              inputRef={searchRef}
              hint="/"
              placeholder="Search name, staff ID, role…"
              className="min-w-[220px] flex-1 sm:max-w-sm"
            />

            <select
              className="field w-auto"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as Role | "all")}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>

            <div className="flex overflow-hidden rounded-lg border border-rule-strong">
              {(["all", "active", "inactive"] as StatusFilter[]).map((s, i) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${i > 0 ? "border-l border-rule-strong" : ""}`}
                  style={
                    statusFilter === s
                      ? { background: "var(--accent)", color: "var(--on-accent)" }
                      : { background: "var(--surface)", color: "var(--ink-3)" }
                  }
                >
                  {s}
                </button>
              ))}
            </div>

            {anyFilter && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                <X size={13} /> Clear
              </button>
            )}
          </div>

          {/* Table */}
          <div className="card overflow-hidden" style={{ animation: "fadeIn 0.28s var(--ease-standard) 0.08s both" }}>
            <div className="overflow-x-auto">
              <table className="dtable">
                <thead>
                  <tr>
                    <SortHead label="Name" k="name" sortKey={sortKey} asc={sortAsc} onSort={toggleSort} />
                    <SortHead label="Staff ID" k="staffId" sortKey={sortKey} asc={sortAsc} onSort={toggleSort} />
                    <SortHead label="Role" k="role" sortKey={sortKey} asc={sortAsc} onSort={toggleSort} />
                    <th>Designation</th>
                    <SortHead label="Territory" k="territory" sortKey={sortKey} asc={sortAsc} onSort={toggleSort} />
                    <th>Status</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-14 text-center">
                        <p className="text-sm font-medium text-ink-2">No users match these filters.</p>
                        <button className="btn btn-ghost btn-sm mt-3" onClick={clearFilters}>
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr key={u.id}>
                        <td className="strong">
                          <span className="flex items-center gap-2.5">
                            <span
                              className="avatar avatar-sm shrink-0"
                              style={{
                                background:
                                  u.role === "SUPER_ADMIN" ? "var(--accent-soft)" : "var(--surface-3)",
                                color: u.role === "SUPER_ADMIN" ? "var(--accent)" : "var(--ink-3)",
                                fontSize: 11,
                                opacity: u.isActive ? 1 : 0.5,
                              }}
                            >
                              {initials(u.name)}
                            </span>
                            <span style={u.isActive ? undefined : { opacity: 0.6 }}>{u.name}</span>
                          </span>
                        </td>
                        <td className="font-mono text-xs">{u.staffId}</td>
                        <td>{ROLE_META[u.role].label}</td>
                        <td className="text-ink-3">{u.designation || "—"}</td>
                        <td className="text-ink-3">{u.territory?.name || "—"}</td>
                        <td>
                          {u.isActive ? <Chip tone="ok">Active</Chip> : <Chip tone="neutral">Inactive</Chip>}
                        </td>
                        <td>
                          <div className="flex items-center justify-end gap-1.5">
                            <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>
                              <Pencil size={14} /> Edit
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>
                              {u.isActive ? "Deactivate" : "Activate"}
                            </button>
                            <button
                              className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:text-bad"
                              onClick={() => remove(u)}
                              aria-label={`Delete ${u.name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 && (
              <div className="flex items-center justify-between border-t border-rule bg-surface-2 px-4 py-2.5">
                <span className="font-mono text-[11px] text-ink-3">
                  {filtered.length === users.length
                    ? `${users.length} ${users.length === 1 ? "user" : "users"}`
                    : `${filtered.length} of ${users.length} users`}
                </span>
                <span className="hidden font-mono text-[11px] text-ink-3 sm:inline">
                  Press <span className="kbd">/</span> to search
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* Create / edit dialog */}
      {open && (
        <div className="backdrop backdrop-center" onClick={() => !saving && setOpen(false)}>
          <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-xl font-bold text-ink">
                  {editing ? "Edit user" : "Add user"}
                </h3>
                <p className="mt-0.5 text-sm text-ink-2">
                  {editing
                    ? `Updating ${editing.staffId}`
                    : "The Staff ID is the login handle and must be unique."}
                </p>
              </div>
              <button
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                onClick={() => setOpen(false)}
                disabled={saving}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Full name" required>
                  <input
                    className="field"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </Labeled>
                <Labeled label="Staff ID" required>
                  <input
                    className="field font-mono"
                    value={form.staffId}
                    onChange={(e) => setForm({ ...form, staffId: e.target.value })}
                    placeholder="ARO-014"
                  />
                </Labeled>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Role">
                  <select
                    className="field"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                  >
                    {ALL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                    {ROLE_META[form.role].designations !== "—"
                      ? `Typical designations: ${ROLE_META[form.role].designations}`
                      : "Full system access."}
                  </p>
                </Labeled>
                <Labeled label="Territory">
                  <select
                    className="field"
                    value={form.territoryId}
                    onChange={(e) => setForm({ ...form, territoryId: e.target.value })}
                  >
                    <option value="">None</option>
                    {territories.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Labeled>
              </div>
              <Labeled label="Designation">
                <input
                  className="field"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Senior Manager"
                />
              </Labeled>
              <Labeled
                label={editing ? "New password" : "Password"}
                required={!editing}
                hint={editing ? "Leave blank to keep the current password" : "At least 6 characters"}
              >
                <input
                  className="field"
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder={editing ? "••••••••" : "At least 6 characters"}
                />
              </Labeled>
              {editing && (
                <label className="flex items-center gap-2.5 rounded-lg border border-rule bg-surface-2 px-3 py-2.5 text-sm text-ink-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent)]"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Account is active
                  <span className="ml-auto text-[11px] text-ink-3">
                    {form.isActive ? "Can sign in" : "Sign-in blocked"}
                  </span>
                </label>
              )}
            </div>

            {error && (
              <div
                className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-xs font-medium text-bad"
                style={{ animation: "scaleIn 0.15s ease" }}
              >
                <AlertCircle size={14} className="mt-px shrink-0" />
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={save} disabled={saving || invalid}>
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : editing ? (
                  "Save changes"
                ) : (
                  "Create user"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHead({
  label,
  k,
  sortKey,
  asc,
  onSort,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
}) {
  const on = sortKey === k;
  return (
    <th className="sortable" onClick={() => onSort(k)}>
      <span className="inline-flex items-center gap-1.5" style={on ? { color: "var(--accent)" } : undefined}>
        {label}
        {on ? (
          asc ? <ArrowUp size={11} /> : <ArrowDown size={11} />
        ) : (
          <ArrowUpDown size={11} className="opacity-30" />
        )}
      </span>
    </th>
  );
}

/**
 * A stat cell inside the users canvas. Clickable variants toggle a filter and
 * show a coloured underline when active — the filter state is legible on the
 * cell itself without extra chrome.
 */
function StatCell({
  icon,
  label,
  value,
  sub,
  tone,
  onClick,
  on,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: string;
  tone: "neutral" | "accent" | "ok" | "bad";
  onClick?: () => void;
  on?: boolean;
}) {
  const color =
    tone === "accent"
      ? "var(--accent)"
      : tone === "ok"
        ? "var(--ok)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--ink-3)";
  const soft =
    tone === "accent"
      ? "var(--accent-soft)"
      : tone === "ok"
        ? "var(--ok-soft)"
        : tone === "bad"
          ? "var(--bad-soft)"
          : "var(--surface-3)";

  const inner = (
    <>
      <div className="flex items-center gap-1.5">
        <span
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md"
          style={{ background: soft, color }}
        >
          {icon}
        </span>
        <span
          className="truncate font-mono text-[10px] font-medium uppercase tracking-[0.1em]"
          style={{ color: on ? color : "var(--ink-3)" }}
        >
          {label}
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span
          className="font-display text-[22px] font-bold leading-none tnum text-ink"
          style={{ letterSpacing: "-0.02em" }}
        >
          <CountUp value={value} />
        </span>
        {sub && <span className="font-mono text-[10px] text-ink-3">{sub}</span>}
      </div>
    </>
  );

  const base = "relative px-4 py-3.5 transition-colors duration-150";

  if (!onClick) {
    return <div className={base}>{inner}</div>;
  }

  return (
    <button
      onClick={onClick}
      className={`${base} text-left hover:bg-surface-2`}
      aria-pressed={on}
    >
      {inner}
      {/* Active underline — a hairline in the tone colour along the bottom. */}
      <span
        aria-hidden
        className="absolute inset-x-4 bottom-0 h-[2px] rounded-full transition-opacity duration-200"
        style={{ background: color, opacity: on ? 1 : 0 }}
      />
    </button>
  );
}

function Labeled({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  // The <label> wraps the control so the association is implicit — clicking the
  // text focuses the field and screen readers announce it, with no id plumbing.
  return (
    <label className="block">
      <span className="label mb-1.5 flex items-center gap-1.5">
        {label}
        {required && <span style={{ color: "var(--bad)" }}>*</span>}
      </span>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-ink-3">{hint}</p>}
    </label>
  );
}

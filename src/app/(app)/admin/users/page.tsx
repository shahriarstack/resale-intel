"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Upload,
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
  KeyRound,
  MapPinOff,
} from "lucide-react";
import type { PostingKind, RecoveryPart, Role } from "@prisma/client";
import { getJSON, sendJSON } from "@/lib/http";
import { ALL_ROLES, ROLE_META } from "@/lib/rbac";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { SearchBar } from "@/components/ui/SearchBar";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { UserImportDialog } from "@/components/admin/UserImportDialog";
import { portalPairingError } from "@/lib/portals";
import { postingError, postingLine, spentCovers } from "@/lib/postings";

interface AdminUser {
  id: string;
  name: string;
  staffId: string;
  designation: string | null;
  role: Role;
  isActive: boolean;
  postings: {
    kind: PostingKind;
    territoryId: string;
    territory: { name: string; part: RecoveryPart | null };
  }[];
  salesTerritory: string | null;
  portalId: string | null;
  portal: { id: string; name: string; isActive: boolean } | null;
}
interface Territory {
  id: string;
  name: string;
}
/** Only the two fields the picker needs — the composition lives at
 *  /admin/portals and is not this form's business. */
interface PortalOption {
  id: string;
  name: string;
  isActive: boolean;
}

const blank = {
  name: "",
  staffId: "",
  designation: "",
  role: "RECOVERY_TEAM" as Role,
  // Names, not ids. A territory comes into existence when an officer is
  // posted to it, so the form cannot work in ids — a patch being named for
  // the first time has none yet. The API resolves these to rows.
  territoryNames: [] as string[],
  baseTerritoryName: "",
  salesTerritory: "",
  portalId: "",
  isActive: true,
};

type SortKey = "name" | "staffId" | "role" | "territory";

/**
 * The territory column, per role.
 *
 * Sales officers work a sales patch (`salesTerritory`); everyone else works a
 * recovery Territory. They are different maps, so the column picks by role
 * rather than falling back from one to the other — a fallback would print an
 * ARO's recovery territory under a sales officer's name the moment someone
 * changed a role, which is exactly the kind of wrong-but-plausible cell
 * nobody catches.
 */
function territoryOf(u: AdminUser): string {
  if (u.role === "SALES_TEAM") return u.salesTerritory?.trim() || "";
  // "Dhaka North, covering Rajshahi" — one phrasing, shared with the coverage
  // board and the capture-window console, so a posting reads the same wherever
  // it appears.
  return postingLine(u.postings);
}
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
  const [portals, setPortals] = useState<PortalOption[]>([]);
  const [importing, setImporting] = useState(false);
  // Every sales patch already in use, for the datalist. Derived from the user
  // list rather than stored anywhere: the set of sales territories IS whatever
  // the sales officers are assigned to, so there is nothing else to keep true.
  const salesTerritories = useMemo(
    () =>
      [...new Set(users.map((u) => u.salesTerritory).filter(Boolean) as string[])].sort(),
    [users],
  );
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
    const [u, t, p] = await Promise.all([
      getJSON<AdminUser[]>("/api/admin/users"),
      getJSON<Territory[]>("/api/admin/territories"),
      getJSON<PortalOption[]>("/api/admin/portals"),
    ]);
    setUsers(u);
    setTerritories(t);
    setPortals(p);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [u, t, p] = await Promise.all([
          getJSON<AdminUser[]>("/api/admin/users"),
          getJSON<Territory[]>("/api/admin/territories"),
          getJSON<PortalOption[]>("/api/admin/portals"),
        ]);
        if (active) {
          setUsers(u);
          setTerritories(t);
          setPortals(p);
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

  /**
   * Covers that have done their job.
   *
   * The half of the arrangement nobody remembers. Picking up a vacant patch is
   * a decision somebody makes deliberately; putting it down again is a thing
   * that should have happened the week the new officer started, and until now
   * there was nothing anywhere that would say so.
   *
   * Derived from the roster the page already has — the moment a territory gets
   * an officer based in it, every cover on that territory becomes spent, on
   * this screen, without anyone updating a second record. Nothing is revoked
   * automatically: releasing somebody is a decision, and this only points at
   * it.
   */
  const releasable = useMemo(() => spentCovers(users), [users]);

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
          territoryOf(u).toLowerCase().includes(q),
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
          cmp = territoryOf(a).localeCompare(territoryOf(b));
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
      territoryNames: u.postings.map((p) => p.territory.name),
      baseTerritoryName:
        u.postings.find((p) => p.kind === "BASE")?.territory.name ?? "",
      salesTerritory: u.salesTerritory ?? "",
      portalId: u.portalId ?? "",
      isActive: u.isActive,
    });
    setError("");
    setOpen(true);
  };

  const invalid = !form.name.trim() || !form.staffId.trim();

  const save = async () => {
    // An ARO is dedicated to a single territory. Without one their captures
    // fall into the Unassigned row of the coverage table and no Recovery
    // Manager sees them under either part.
    // The same rule the API enforces, so the admin reads it before the round
    // trip rather than after it — and it is the API's own message.
    const posting = postingError(
      form.role,
      form.territoryNames,
      form.baseTerritoryName || null,
    );
    if (posting) {
      setError(posting);
      return;
    }

    // The same rule the API enforces, checked here so the admin reads it
    // before the round trip rather than after it. The message is the API's
    // own — one wording, one place.
    const pairing = portalPairingError(
      form.role,
      form.role === "PORTAL_VIEWER" ? form.portalId || null : null,
    );
    if (pairing) {
      setError(pairing);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload: Record<string, unknown> = {
        name: form.name,
        staffId: form.staffId,
        designation: form.designation,
        role: form.role,
        territoryNames: form.territoryNames,
        baseTerritoryName: form.baseTerritoryName || null,
        // Only ever sent for a sales officer. Changing someone's role away
        // from sales clears it, so a stale patch name cannot linger on an
        // engineer and turn up in the offer book.
        salesTerritory: form.role === "SALES_TEAM" ? form.salesTerritory : "",
        // Same argument as the sales patch above: sent as null for every other
        // role, so moving somebody off a portal actually detaches them rather
        // than leaving a lens attached to an account that no longer reads
        // through one.
        portalId: form.role === "PORTAL_VIEWER" ? form.portalId || null : null,
      };
      if (editing) {
        payload.isActive = form.isActive;
        await sendJSON(`/api/admin/users/${editing.id}`, "PATCH", payload);
        toast("User updated successfully");
      } else {
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
    <div className="mx-auto w-full max-w-6xl px-6 py-7 lg:px-8">
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
          <button className="btn btn-ghost" onClick={() => setImporting(true)}>
            <Upload size={16} /> Import CSV
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={16} /> Add user
          </button>
        </div>
      </header>

      {/* A cover whose vacancy has been filled. */}
      {releasable.length > 0 && (
        <section
          className="mb-5 flex items-start gap-3 rounded-xl px-4 py-3.5"
          style={{ background: "color-mix(in srgb, var(--warn) 9%, var(--surface))" }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{
              background: "color-mix(in srgb, var(--warn) 16%, var(--surface))",
              color: "var(--warn-ink)",
            }}
          >
            <MapPinOff size={17} />
          </span>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold" style={{ color: "var(--warn-ink)" }}>
              {releasable.length} cover{releasable.length === 1 ? "" : "s"} can be released
            </div>
            <ul className="mt-1 space-y-0.5">
              {releasable.map((c) => (
                <li key={`${c.officer.id}-${c.territoryId}`} className="text-[12px] text-ink-2">
                  <strong className="font-semibold text-ink">{c.officer.name}</strong> is still
                  covering <strong className="font-semibold text-ink">{c.territoryName}</strong>,
                  which {c.basedOfficers.join(" and ")} {c.basedOfficers.length === 1 ? "is" : "are"}{" "}
                  now posted to.
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

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
                        <td className="text-ink-3">{territoryOf(u) || "—"}</td>
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

      {importing && (
        <UserImportDialog
          territories={territories}
          onClose={() => setImporting(false)}
          onDone={load}
        />
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
                    {/* Two roles carry no designations, and they are opposites
                        — the Super Admin who can do everything and the portal
                        viewer who can do nothing. The old fallback described
                        the first and was shown for both, which on an access
                        form is the worst possible place to be wrong. */}
                    {ROLE_META[form.role].designations !== "—"
                      ? `Typical designations: ${ROLE_META[form.role].designations}`
                      : form.role === "PORTAL_VIEWER"
                        ? "Reads through a portal and can act on nothing — no desk action in the system names this role."
                        : "Full system access."}
                  </p>
                </Labeled>
                {/* Territories are a SET now, not a choice.
                    A patch left unstaffed gets picked up by the officer next
                    door, and the old single select could not say that — so the
                    coverage board showed the vacancy as having nobody at all
                    while somebody was in fact working it.

                    Two controls, because there are two questions: which
                    territories do they work, and which one is theirs. The
                    second only appears once more than one is picked; with a
                    single territory there is nothing to choose and the base is
                    settled automatically. */}
                <Labeled label={form.role === "RECOVERY_TEAM" ? "Territories *" : "Territories"}>
                  {/* Existing patches, plus whatever this form has named that
                      does not exist yet — both are chips, because to the person
                      filling the form they are the same thing. */}
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      ...new Set([
                        ...territories.map((t) => t.name),
                        ...form.territoryNames,
                      ]),
                    ].map((name) => {
                      const on = form.territoryNames.includes(name);
                      const isNew = !territories.some((t) => t.name === name);
                      return (
                        <button
                          key={name}
                          type="button"
                          className="po-chip"
                          data-on={on || undefined}
                          title={isNew ? "New — will be created when you save" : undefined}
                          onClick={() => {
                            const next = on
                              ? form.territoryNames.filter((x) => x !== name)
                              : [...form.territoryNames, name];
                            setForm({
                              ...form,
                              territoryNames: next,
                              // The first one picked is their base, and
                              // dropping the base hands it to whatever is left
                              // — so the pair is never in an impossible state
                              // between two clicks.
                              baseTerritoryName: next.includes(form.baseTerritoryName)
                                ? form.baseTerritoryName
                                : (next[0] ?? ""),
                            });
                          }}
                        >
                          {name}
                          {isNew ? " +" : ""}
                        </button>
                      );
                    })}
                  </div>

                  {/* Naming a patch is how a patch is created. There is no
                      other screen to visit first, and no list to keep in step
                      with the roster. */}
                  <input
                    className="field mt-2"
                    placeholder="Type a territory and press Enter to add it…"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      const name = e.currentTarget.value.trim();
                      if (!name) return;
                      if (form.territoryNames.includes(name)) {
                        e.currentTarget.value = "";
                        return;
                      }
                      const next = [...form.territoryNames, name];
                      setForm({
                        ...form,
                        territoryNames: next,
                        baseTerritoryName: form.baseTerritoryName || next[0],
                      });
                      e.currentTarget.value = "";
                    }}
                  />

                  {form.territoryNames.length > 1 && (
                    <div className="mt-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3">
                        Based in
                      </span>
                      <select
                        className="field mt-1"
                        value={form.baseTerritoryName}
                        onChange={(e) =>
                          setForm({ ...form, baseTerritoryName: e.target.value })
                        }
                      >
                        {form.territoryNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                        The rest are recorded as <strong>cover</strong> — held while those patches
                        have nobody of their own. The coverage board keeps showing them as vacant,
                        which is what stops a stand-in becoming the permanent answer.
                      </p>
                    </div>
                  )}

                  {form.role === "RECOVERY_TEAM" && form.territoryNames.length <= 1 && (
                    <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                      At least one. This is what puts their captures on the coverage table — pick a
                      second if they are covering a patch nobody is posted to.
                    </p>
                  )}
                </Labeled>
              </div>

              {/* Sales runs its own map, drawn differently from the recovery
                  territories above, so it gets its own field rather than
                  borrowing that list. Free text with suggestions from what is
                  already in use: the admin types a name and moves on, and the
                  datalist keeps the spelling consistent without anyone having
                  to maintain a master list. */}
              {form.role === "SALES_TEAM" && (
                <Labeled label="Sales territory">
                  <input
                    className="field"
                    list="sales-territories"
                    value={form.salesTerritory}
                    onChange={(e) => setForm({ ...form, salesTerritory: e.target.value })}
                    placeholder="e.g. Dhaka Metro North"
                    maxLength={80}
                  />
                  <datalist id="sales-territories">
                    {salesTerritories.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                  <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                    Shown beside this officer&rsquo;s name on every customer offer they bring in.
                  </p>
                </Labeled>
              )}
              {/* A portal viewer is defined by their portal — without one the
                  account can sign in and see a title. The API refuses the
                  pair, so this is required rather than optional. */}
              {form.role === "PORTAL_VIEWER" && (
                <Labeled label="Portal" required>
                  <select
                    className="field"
                    value={form.portalId}
                    onChange={(e) => setForm({ ...form, portalId: e.target.value })}
                    required
                  >
                    <option value="">Choose a portal</option>
                    {portals.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.isActive ? "" : " (suspended)"}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-[11px] leading-snug text-ink-3">
                    {portals.length === 0 ? (
                      <>
                        No portals exist yet. Compose one under{" "}
                        <a className="underline" href="/admin/portals">
                          Portals
                        </a>{" "}
                        first — it is what decides everything this account can see.
                      </>
                    ) : (
                      <>
                        This is the whole of their access. Everything they can open, see and read
                        is composed on the portal, not here.
                      </>
                    )}
                  </p>
                </Labeled>
              )}
              <Labeled label="Designation">
                <input
                  className="field"
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Senior Manager"
                />
              </Labeled>
              {/* No password field, because there is no password to choose.
                  The Staff ID above IS the sign-in credential, and it is
                  derived server-side from whatever that field ends up holding
                  — so renaming somebody re-credentials them in the same save,
                  and there is no way for the two to drift apart.

                  Stated here and nowhere the signing-in user can read it: the
                  admin needs to know what to tell a new officer; the login
                  page deliberately does not say what the passcode is. */}
              <div className="rounded-lg border border-rule bg-surface-2 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                  <KeyRound size={13} className="shrink-0 text-accent" />
                  Sign-in credential
                </div>
                <p className="mt-1 text-[11px] leading-snug text-ink-3">
                  {form.staffId.trim() ? (
                    <>
                      They sign in by choosing{" "}
                      <span className="font-semibold text-ink-2">
                        {ROLE_META[form.role].label}
                      </span>{" "}
                      and entering{" "}
                      <span className="font-mono font-semibold text-ink-2">
                        {form.staffId.trim()}
                      </span>
                      . Changing the Staff ID changes what they sign in with.
                    </>
                  ) : (
                    "The Staff ID is what they sign in with, alongside their role. Enter one above."
                  )}
                </p>
              </div>
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
                className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-xs font-medium text-bad-ink"
                style={{ animation: "scaleIn 0.15s var(--ease-spring)" }}
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

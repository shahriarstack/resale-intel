"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PortalAccent, PortalBand, PortalGlyph, PortalModule } from "@prisma/client";
import {
  ArrowLeft,
  Check,
  Eye,
  Info,
  Loader2,
  Lock,
  Pause,
  Play,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { useToast } from "@/components/ui/Toast";
import {
  ACCENT_META,
  ACCENT_ORDER,
  BAND_META,
  BAND_ORDER,
  GLYPH_META,
  GLYPH_ORDER,
  LENS_ORDER,
  MASK,
  MODULE_ORDER,
  PORTAL_LENSES,
  PORTAL_MODULES,
  describePortal,
  liveModules,
  moduleInertReason,
  portalFacets,
  type LensKey,
  type PortalGrant,
} from "@/lib/portals";

/**
 * The Portal Studio.
 *
 * The product's ten roles are all desks: each one holds files and owes a
 * decision. That is the wrong shape for everyone who only ever READS the
 * pipeline — an auditor, a regional finance reader, a lender reviewing
 * collateral — and minting a desk role for each of them would put rows in a
 * table about decisions for people who make none.
 *
 * So this screen composes a lens instead, and it is built around one idea: an
 * admin should never have to imagine what they have granted. The right half of
 * the studio is a mirror. It re-renders on every toggle, it writes the grant
 * back as a sentence of English, and it shows a record with the masks actually
 * applied — because "customer identity: off" is a setting, and `R•••• H••••`
 * is the thing that setting does.
 *
 * Three questions in a fixed order, because that is the order they constrain
 * each other in: scope first (it makes panels inert), then panels, then the
 * lenses over them.
 */

interface Territory {
  id: string;
  name: string;
}

interface Member {
  id: string;
  name: string;
  staffId: string;
  isActive: boolean;
}

interface PortalRow extends PortalGrant {
  createdAt: string;
  createdBy: { name: string } | null;
  members: Member[];
  activeMembers: number;
  description: string;
}

/** The composer's working copy. Territories are held as ids while editing and
 *  resolved to `{id,name}` only for the preview, which is what `describePortal`
 *  and the facets read. */
interface Draft {
  id: string | null;
  name: string;
  purpose: string;
  modules: PortalModule[];
  band: PortalBand;
  territoryIds: string[];
  showCosts: boolean;
  showCustomer: boolean;
  showOffers: boolean;
  showPhotos: boolean;
  accent: PortalAccent;
  glyph: PortalGlyph;
  isActive: boolean;
}

const BLANK: Draft = {
  id: null,
  name: "",
  purpose: "",
  // A new portal opens on the two readings almost every outside reader is
  // actually asking for: what is not earning, and where the book has got to.
  // Starting from these two means the first thing an admin does is add or
  // narrow, rather than assemble a workspace from nothing — and both render
  // under the default "whole fleet" band, so a portal is useful the moment it
  // is named.
  modules: ["OFFROAD_FLEET", "RESALE_PIPELINE"],
  band: "ALL",
  territoryIds: [],
  showCosts: false,
  showCustomer: false,
  showOffers: false,
  showPhotos: false,
  accent: "INDIGO",
  glyph: "COMPASS",
  isActive: true,
};

function draftFrom(p: PortalRow): Draft {
  return {
    id: p.id,
    name: p.name,
    purpose: p.purpose ?? "",
    modules: p.modules,
    band: p.band,
    territoryIds: p.territories.map((t) => t.id),
    showCosts: p.showCosts,
    showCustomer: p.showCustomer,
    showOffers: p.showOffers,
    showPhotos: p.showPhotos,
    accent: p.accent,
    glyph: p.glyph,
    isActive: p.isActive,
  };
}

/** The draft as the grant every shared helper already understands. */
function grantOf(d: Draft, territories: Territory[]): PortalGrant {
  return {
    id: d.id ?? "draft",
    name: d.name.trim() || "Untitled portal",
    purpose: d.purpose.trim() || null,
    modules: d.modules,
    band: d.band,
    territories: territories.filter((t) => d.territoryIds.includes(t.id)),
    showCosts: d.showCosts,
    showCustomer: d.showCustomer,
    showOffers: d.showOffers,
    showPhotos: d.showPhotos,
    accent: d.accent,
    glyph: d.glyph,
    isActive: d.isActive,
  };
}

export default function PortalsAdminPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<PortalRow[] | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(() => {
    getJSON<PortalRow[]>("/api/admin/portals")
      .then(setRows)
      .catch((e) => toast(e.message, "bad"));
  }, [toast]);

  useEffect(() => {
    load();
    getJSON<Territory[]>("/api/admin/territories")
      .then(setTerritories)
      .catch(() => setTerritories([]));
  }, [load]);

  if (draft) {
    return (
      <Studio
        draft={draft}
        territories={territories}
        onChange={setDraft}
        onClose={() => setDraft(null)}
        onSaved={() => {
          setDraft(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-7 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow text-accent">Administration</div>
          <h1 className="page-title mt-1 text-[28px]">Portals</h1>
          <p className="mt-1.5 max-w-2xl text-[14px] text-ink-2">
            A portal is a lens, not a desk. Compose one for people who need to read the pipeline
            without working it — an auditor, a regional office, a lender — by naming what it may
            open, what slice of the fleet it may see, and how much of each record resolves.
            Everyone reading through a portal is read-only, and not by a setting: no desk action
            in the system names them.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setDraft({ ...BLANK })}>
          <Plus size={16} />
          New portal
        </button>
      </header>

      {rows === null ? (
        <div className="card grid h-32 place-items-center">
          <Loader2 size={20} className="animate-spin text-ink-3" />
        </div>
      ) : rows.length === 0 ? (
        <div className="po-blank">
          <span className="po-blank-plate">
            <Eye size={20} strokeWidth={1.8} />
          </span>
          <div>
            <div className="po-blank-title">No portals yet</div>
            <p className="po-blank-note">
              Nobody outside the eight desks can read this system today. That is a perfectly good
              place to be — compose a portal when somebody needs to.
            </p>
          </div>
        </div>
      ) : (
        <div className="po-grid">
          {rows.map((p) => (
            <PortalCard
              key={p.id}
              p={p}
              onEdit={() => setDraft(draftFrom(p))}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function PortalCard({
  p,
  onEdit,
  onChanged,
}: {
  p: PortalRow;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const accent = ACCENT_META[p.accent];
  const Glyph = GLYPH_META[p.glyph].icon;
  const live = liveModules(p);

  const setActive = async (isActive: boolean) => {
    setBusy(true);
    try {
      await sendJSON(`/api/admin/portals/${p.id}`, "PATCH", { isActive });
      toast(isActive ? `${p.name} is live again` : `${p.name} is suspended`, "ok");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await sendJSON(`/api/admin/portals/${p.id}`, "DELETE");
      toast(`${p.name} deleted`, "ok");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className="po-card"
      data-off={!p.isActive}
      style={
        {
          "--pt-fill": accent.fill,
          "--pt-ink": accent.ink,
          "--pt-soft": accent.soft,
        } as React.CSSProperties
      }
    >
      <div className="po-card-top">
        <span className="po-key">
          <Glyph size={20} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="po-card-name">{p.name}</h2>
          <p className="po-card-desc">{p.description}</p>
        </div>
        {!p.isActive && <span className="po-off">Suspended</span>}
      </div>

      <div className="po-facets">
        {portalFacets(p).map((f) => (
          <span key={f.label} className="po-facet">
            <span className="po-facet-label">{f.label}</span>
            <span className="po-facet-value">{f.value}</span>
          </span>
        ))}
      </div>

      <div className="po-card-panels">
        {live.map((m) => {
          const Icon = PORTAL_MODULES[m].icon;
          return (
            <span key={m} className="po-pill">
              <Icon size={11} />
              {PORTAL_MODULES[m].label}
            </span>
          );
        })}
      </div>

      <footer className="po-card-foot">
        <span className="po-members">
          <Users size={13} />
          {p.members.length === 0 ? (
            "Nobody assigned"
          ) : (
            <>
              {p.members.length} member{p.members.length === 1 ? "" : "s"}
              {p.activeMembers !== p.members.length && (
                <span className="muted"> · {p.activeMembers} active</span>
              )}
            </>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <a className="btn btn-ghost btn-sm" href={`/portal?preview=${p.id}`}>
            <Eye size={14} />
            Preview
          </a>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}>
            Edit
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setActive(!p.isActive)}
            disabled={busy}
            title={p.isActive ? "Suspend — members lose access at once" : "Switch back on"}
          >
            {p.isActive ? <Pause size={14} /> : <Play size={14} />}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={remove}
            disabled={busy}
            title="Delete"
          >
            <Trash2 size={14} />
          </button>
        </span>
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function Studio({
  draft,
  territories,
  onChange,
  onClose,
  onSaved,
}: {
  draft: Draft;
  territories: Territory[];
  onChange: (d: Draft) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => onChange({ ...draft, [k]: v });

  const grant = useMemo(() => grantOf(draft, territories), [draft, territories]);
  const live = liveModules(grant);

  const toggleModule = (m: PortalModule) => {
    const on = draft.modules.includes(m);
    const next = on ? draft.modules.filter((x) => x !== m) : [...draft.modules, m];
    // Turning on a panel that needs a lens turns the lens on with it. The
    // alternative is a panel that is granted and inert, which an admin has to
    // notice and fix — and the studio already knows the answer.
    const needs = PORTAL_MODULES[m].needsLens;
    if (!on && needs && !draft[needs]) {
      onChange({ ...draft, modules: next, [needs]: true });
      toast(`${PORTAL_LENSES[needs].label} turned on — ${PORTAL_MODULES[m].label} needs it`, "ok");
      return;
    }
    set("modules", next);
  };

  const toggleTerritory = (id: string) => {
    set(
      "territoryIds",
      draft.territoryIds.includes(id)
        ? draft.territoryIds.filter((x) => x !== id)
        : [...draft.territoryIds, id],
    );
  };

  const invalid = draft.name.trim().length < 2 || draft.modules.length === 0;

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        purpose: draft.purpose.trim(),
        modules: draft.modules,
        band: draft.band,
        territoryIds: draft.territoryIds,
        showCosts: draft.showCosts,
        showCustomer: draft.showCustomer,
        showOffers: draft.showOffers,
        showPhotos: draft.showPhotos,
        accent: draft.accent,
        glyph: draft.glyph,
        isActive: draft.isActive,
      };
      if (draft.id) {
        await sendJSON(`/api/admin/portals/${draft.id}`, "PATCH", payload);
        toast(`${payload.name} updated`, "ok");
      } else {
        await sendJSON("/api/admin/portals", "POST", payload);
        toast(`${payload.name} created`, "ok");
      }
      onSaved();
    } catch (e) {
      toast((e as Error).message, "bad");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-7 lg:px-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <ArrowLeft size={15} />
            Portals
          </button>
          <div className="min-w-0">
            <div className="eyebrow text-accent">
              {draft.id ? "Recomposing" : "New portal"}
            </div>
            <h1 className="page-title text-[24px]">{draft.name.trim() || "Untitled portal"}</h1>
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving || invalid}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : draft.id ? "Save portal" : "Create portal"}
        </button>
      </header>

      <div className="po-studio">
        {/* ---- The composer ---- */}
        <div className="po-compose">
          <Block step="Identity" title="What is it called?">
            <div className="po-field">
              <label className="po-label">Name</label>
              <input
                className="field"
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Chittagong finance"
                maxLength={80}
              />
              <p className="po-hint">
                Its members see this as the name of their workspace, so name the place they
                belong to rather than the permissions it carries.
              </p>
            </div>
            <div className="po-field">
              <label className="po-label">Purpose</label>
              <input
                className="field"
                value={draft.purpose}
                onChange={(e) => set("purpose", e.target.value)}
                placeholder="Why this portal exists"
                maxLength={200}
              />
              <p className="po-hint">
                Optional, and worth writing — a portal outlives the conversation that created it.
              </p>
            </div>
            <div className="po-field">
              <label className="po-label">Mark</label>
              <div className="po-marks">
                {ACCENT_ORDER.map((a) => (
                  <button
                    key={a}
                    className="po-swatch"
                    data-on={draft.accent === a}
                    style={{ background: ACCENT_META[a].fill }}
                    onClick={() => set("accent", a)}
                    aria-label={ACCENT_META[a].label}
                    title={ACCENT_META[a].label}
                  />
                ))}
              </div>
              <div className="po-glyphs">
                {GLYPH_ORDER.map((g) => {
                  const Icon = GLYPH_META[g].icon;
                  return (
                    <button
                      key={g}
                      className="po-glyph"
                      data-on={draft.glyph === g}
                      onClick={() => set("glyph", g)}
                      aria-label={GLYPH_META[g].label}
                      title={GLYPH_META[g].label}
                    >
                      <Icon size={16} />
                    </button>
                  );
                })}
              </div>
            </div>
          </Block>

          <Block step="1" title="What may it see?">
            <div className="po-bands">
              {BAND_ORDER.map((b) => (
                <button
                  key={b}
                  className="po-band"
                  data-on={draft.band === b}
                  onClick={() => set("band", b)}
                >
                  <span className="po-band-name">{BAND_META[b].label}</span>
                  <span className="po-band-note">{BAND_META[b].blurb}</span>
                </button>
              ))}
            </div>

            <div className="po-field">
              <label className="po-label">Territories</label>
              <div className="po-chips">
                <button
                  className="po-chip"
                  data-on={draft.territoryIds.length === 0}
                  onClick={() => set("territoryIds", [])}
                >
                  All territories
                </button>
                {territories.map((t) => (
                  <button
                    key={t.id}
                    className="po-chip"
                    data-on={draft.territoryIds.includes(t.id)}
                    onClick={() => toggleTerritory(t.id)}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
              <p className="po-hint">
                Picking none means every territory. Picking some is what makes a regional reader
                possible without inventing a regional role.
              </p>
            </div>
          </Block>

          <Block step="2" title="What may it open?">
            <div className="po-modules">
              {MODULE_ORDER.map((m) => {
                const meta = PORTAL_MODULES[m];
                const on = draft.modules.includes(m);
                // Depends only on the band and the lenses, never on whether
                // this panel is currently granted — so the reason is ready
                // before the admin turns it on, and is shown once they do.
                const inert = moduleInertReason(m, grant);
                const Icon = meta.icon;
                return (
                  <button
                    key={m}
                    className="po-module"
                    data-on={on}
                    data-inert={on && inert !== null}
                    onClick={() => toggleModule(m)}
                  >
                    <span className="po-module-glyph">
                      <Icon size={15} strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="po-module-name">{meta.label}</span>
                      <span className="po-module-q">{meta.question}</span>
                      {on && inert && (
                        <span className="po-module-warn">
                          <Info size={11} />
                          {inert}
                        </span>
                      )}
                    </span>
                    <span className="po-tick">{on && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          </Block>

          <Block step="3" title="How much of each record resolves?">
            <div className="po-lenses">
              {LENS_ORDER.map((k) => {
                const meta = PORTAL_LENSES[k];
                const on = draft[k];
                const Icon = meta.icon;
                return (
                  <button
                    key={k}
                    className="po-lens"
                    data-on={on}
                    onClick={() => set(k, !on as Draft[LensKey])}
                  >
                    <span className="po-lens-glyph">
                      {on ? <Icon size={15} /> : <Lock size={14} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="po-module-name">{meta.label}</span>
                      <span className="po-module-q">{on ? meta.blurb : meta.redactedAs}</span>
                    </span>
                    <span className="po-tick">{on && <Check size={13} strokeWidth={3} />}</span>
                  </button>
                );
              })}
            </div>
          </Block>
        </div>

        {/* ---- The mirror ---- */}
        <Mirror grant={grant} live={live} />
      </div>
    </div>
  );
}

function Block({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="po-block">
      <header className="po-block-head">
        <span className="po-step">{step}</span>
        <h2 className="po-block-title">{title}</h2>
      </header>
      <div className="po-block-body">{children}</div>
    </section>
  );
}

/**
 * The mirror.
 *
 * Not a summary of the settings — a rendering of their consequence. The
 * sentence is the same `describePortal` the member reads in their own header,
 * and the sample row below carries the masks actually applied, because
 * "customer identity: off" is a setting and `R•••• H••••` is what it does.
 *
 * The row is a fixed sample rather than a real record on purpose: this
 * re-renders on every keystroke, and a live query would trade an instant
 * mirror for a loading state. The real thing is one click away on Preview,
 * once there is a portal to preview.
 */
function Mirror({ grant, live }: { grant: PortalGrant; live: PortalModule[] }) {
  const accent = ACCENT_META[grant.accent];
  const Glyph = GLYPH_META[grant.glyph].icon;
  const granted = grant.modules.length;

  return (
    <aside
      className="po-mirror"
      style={
        {
          "--pt-fill": accent.fill,
          "--pt-ink": accent.ink,
          "--pt-soft": accent.soft,
        } as React.CSSProperties
      }
    >
      <div className="po-mirror-label">What they will see</div>

      <div className="po-mirror-card">
        <span className="po-key">
          <Glyph size={20} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <div className="po-mirror-name">{grant.name}</div>
          <div className="po-mirror-band">{BAND_META[grant.band].label}</div>
        </div>
      </div>

      <p className="po-mirror-sentence">{describePortal(grant)}</p>

      <div className="po-mirror-panels">
        {live.length === 0 ? (
          <p className="po-mirror-none">
            No panel would render. Turn one on, or widen the scope — a portal with nothing to
            show is an account that can sign in and read a title.
          </p>
        ) : (
          live.map((m) => {
            const Icon = PORTAL_MODULES[m].icon;
            return (
              <span key={m} className="po-pill">
                <Icon size={11} />
                {PORTAL_MODULES[m].label}
              </span>
            );
          })
        )}
        {granted > live.length && (
          <span className="po-mirror-inert">
            {granted - live.length} granted panel{granted - live.length === 1 ? "" : "s"} would
            render empty under this scope
          </span>
        )}
      </div>

      <div className="po-sample">
        <div className="po-sample-label">A record, as they would read it</div>
        <dl className="po-sample-rows">
          <SampleRow label="Registration" value="DHAKA-METRO-11-4472" mono />
          <SampleRow
            label="Customer"
            value={grant.showCustomer ? "Rakib Hasan" : `R${MASK} H${MASK}`}
            masked={!grant.showCustomer}
          />
          <SampleRow label="Vehicle" value="Foton Aumark 3.5T" />
          <SampleRow
            label="Cost basis"
            value={grant.showCosts ? "Tk 8,42,000" : `Tk ${MASK}`}
            masked={!grant.showCosts}
          />
          <SampleRow
            label="Top offer"
            value={grant.showOffers ? "Tk 11,20,000" : "3 offers"}
            masked={!grant.showOffers}
          />
          <SampleRow
            label="Photographs"
            value={grant.showPhotos ? "6 images" : "6 on file"}
            masked={!grant.showPhotos}
          />
        </dl>
      </div>

      <p className="po-mirror-foot">
        Read-only throughout. No desk action in the system names a portal viewer, so there is
        nothing on any of these panels for them to press.
      </p>
    </aside>
  );
}

function SampleRow({
  label,
  value,
  mono,
  masked,
}: {
  label: string;
  value: string;
  mono?: boolean;
  masked?: boolean;
}) {
  return (
    <>
      <dt className="po-sample-k">{label}</dt>
      <dd className={`po-sample-v ${mono ? "mono" : ""}`} data-masked={masked}>
        {value}
      </dd>
    </>
  );
}

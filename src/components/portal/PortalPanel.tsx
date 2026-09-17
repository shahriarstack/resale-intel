import type { PortalModule } from "@prisma/client";
import { Info } from "lucide-react";
import { STATUS_META, statusLabel } from "@/lib/status";
import { OFFROAD_KIND_META } from "@/lib/offroad";
import { taka, shortDate, timeAgo } from "@/lib/format";
import { MASK, type ModuleMeta, type PortalGrant } from "@/lib/portals";
import type { PortalView } from "@/lib/portalDesk";
import { Chip } from "@/components/ui/Chip";

/**
 * One panel of a portal.
 *
 * Every panel is the same object — a titled card with the question it answers
 * under the title — because a portal is read by someone who does not work here
 * and will not learn eight different layouts. The desks get surfaces tuned to
 * the job they do all day; a portal gets one shape repeated.
 *
 * A masked figure arrives as `null` from the loader and renders as `Tk ••••`.
 * That is deliberate and it is why the column stays: a register with the cost
 * column removed reads as vehicles that cost nothing.
 */

function Money({ value }: { value: number | null }) {
  if (value === null) return <span className="pt-mask">Tk {MASK}</span>;
  return <span className="tabular-nums">{taka(value)}</span>;
}

export function PortalPanel({
  module,
  meta,
  inert,
  grant,
  view,
}: {
  module: PortalModule;
  meta: ModuleMeta;
  inert: string | null;
  grant: PortalGrant;
  view: PortalView;
}) {
  const Icon = meta.icon;

  return (
    <section className="pt-panel">
      <header className="pt-panel-head">
        <span className="pt-panel-glyph">
          <Icon size={15} strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 className="pt-panel-title">{meta.label}</h2>
          <p className="pt-panel-question">{meta.question}</p>
        </div>
      </header>

      {inert ? (
        <div className="pt-inert">
          <Info size={13} className="mt-px shrink-0" />
          <span>{inert}</span>
        </div>
      ) : (
        <Body module={module} grant={grant} view={view} />
      )}
    </section>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="pt-empty">Nothing {what} in this portal&rsquo;s scope.</p>;
}

function Body({
  module,
  grant,
  view,
}: {
  module: PortalModule;
  grant: PortalGrant;
  view: PortalView;
}) {
  switch (module) {
    // ---- Fleet register --------------------------------------------------
    case "FLEET_REGISTER": {
      const data = view.register;
      if (!data || data.rows.length === 0) return <Empty what="on the register" />;
      return (
        <>
          <div className="pt-scroll">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Customer</th>
                  <th>Vehicle</th>
                  <th>Status</th>
                  <th>Territory</th>
                  <th className="num">Cost</th>
                  <th className="num">Offers</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.registrationNo}</td>
                    <td className={grant.showCustomer ? "" : "pt-mask"}>{r.customer}</td>
                    <td>{r.vehicle}</td>
                    <td>
                      <Chip tone={STATUS_META[r.status].tone}>{statusLabel(r.status)}</Chip>
                    </td>
                    <td className="muted">{r.territory ?? "—"}</td>
                    <td className="num">
                      <Money value={r.cost} />
                    </td>
                    <td className="num">
                      {r.offerCount === 0 ? (
                        <span className="muted">—</span>
                      ) : grant.showOffers && r.topOffer !== null ? (
                        <span className="tabular-nums">{taka(r.topOffer)}</span>
                      ) : (
                        <span className="muted">
                          {r.offerCount} offer{r.offerCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.total > data.rows.length && (
            <p className="pt-more">
              Showing the {data.rows.length} most recent of {data.total}.
            </p>
          )}
        </>
      );
    }

    // ---- Pipeline --------------------------------------------------------
    case "RESALE_PIPELINE": {
      const rows = view.pipeline;
      if (!rows || rows.length === 0) return <Empty what="in the pipeline" />;
      const max = Math.max(...rows.map((r) => r.n), 1);
      // Ordered by the desk chain rather than by size: the shape of the
      // pipeline is the reading, and sorting it by volume destroys that.
      const ordered = (Object.keys(STATUS_META) as (keyof typeof STATUS_META)[])
        .map((s) => rows.find((r) => r.status === s))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
      return (
        <div className="pt-bars">
          {ordered.map((r) => (
            <div key={r.status} className="pt-bar-row">
              <span className="pt-bar-label">{statusLabel(r.status)}</span>
              <span className="pt-bar-track">
                <span className="pt-bar-fill" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="pt-bar-n tabular-nums">{r.n}</span>
            </div>
          ))}
        </div>
      );
    }

    // ---- Off-road fleet --------------------------------------------------
    case "OFFROAD_FLEET": {
      const rows = view.offroad;
      if (!rows || rows.length === 0) return <Empty what="off the road" />;
      return (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Reason</th>
                <th>Customer</th>
                <th>Territory</th>
                <th className="num">Days off</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.registrationNo}</td>
                  <td>
                    <Chip tone={OFFROAD_KIND_META[c.kind].tone}>
                      {OFFROAD_KIND_META[c.kind].label}
                    </Chip>
                  </td>
                  <td className={grant.showCustomer ? "" : "pt-mask"}>{c.customer}</td>
                  <td className="muted">{c.territory ?? "—"}</td>
                  <td className="num tabular-nums">{c.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ---- Sales & margin --------------------------------------------------
    case "SALES_MARGIN": {
      const data = view.margin;
      if (!data || data.rows.length === 0) return <Empty what="sold" />;
      const pct = data.totalPrice === 0 ? 0 : (data.totalMargin / data.totalPrice) * 100;
      return (
        <>
          <div className="pt-figures">
            <Figure label="Realised" value={taka(data.totalPrice)} />
            <Figure label="Cost basis" value={taka(data.totalCost)} />
            <Figure
              label="Margin"
              value={taka(data.totalMargin)}
              sub={`${pct.toFixed(1)}%`}
              tone={data.totalMargin >= 0 ? "ok" : "bad"}
            />
          </div>
          <div className="pt-scroll">
            <table className="pt-table">
              <thead>
                <tr>
                  <th>Registration</th>
                  <th>Vehicle</th>
                  <th>Sold</th>
                  <th className="num">Price</th>
                  <th className="num">Cost</th>
                  <th className="num">Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">{r.registrationNo}</td>
                    <td>{r.vehicle}</td>
                    <td className="muted">{shortDate(r.soldAt)}</td>
                    <td className="num tabular-nums">{taka(r.price)}</td>
                    <td className="num tabular-nums">{taka(r.cost)}</td>
                    <td className="num tabular-nums" data-neg={r.margin < 0}>
                      {taka(r.margin)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    // ---- Territory spread ------------------------------------------------
    case "TERRITORY_SPREAD": {
      const rows = view.spread;
      if (!rows || rows.length === 0) return <Empty what="to spread" />;
      const max = Math.max(...rows.map((r) => r.n), 1);
      return (
        <div className="pt-bars">
          {rows.map((r) => (
            <div key={r.territory} className="pt-bar-row">
              <span className="pt-bar-label">{r.territory}</span>
              <span className="pt-bar-track">
                <span className="pt-bar-fill" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="pt-bar-n tabular-nums">{r.n}</span>
              <span className="pt-bar-value">
                <Money value={r.value} />
              </span>
            </div>
          ))}
        </div>
      );
    }

    // ---- Repair watch ----------------------------------------------------
    case "REPAIR_WATCH": {
      const rows = view.repairs;
      if (!rows || rows.length === 0) return <Empty what="under repair" />;
      return (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Vehicle</th>
                <th>Engineer</th>
                <th>Deadline</th>
                <th className="num">Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.registrationNo}</td>
                  <td>{r.vehicle}</td>
                  <td className="muted">{r.engineer ?? "Unassigned"}</td>
                  <td className="muted">{shortDate(r.deadline)}</td>
                  <td className="num">
                    <Chip tone={r.daysLeft < 0 ? "bad" : r.daysLeft <= 2 ? "warn" : "neutral"}>
                      {r.daysLeft < 0 ? `${-r.daysLeft} over` : `${r.daysLeft} left`}
                    </Chip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ---- Letter ladder ---------------------------------------------------
    case "LETTER_LADDER": {
      const rows = view.ladder;
      if (!rows || rows.length === 0) return <Empty what="on the ladder" />;
      return (
        <div className="pt-scroll">
          <table className="pt-table">
            <thead>
              <tr>
                <th>Registration</th>
                <th>Customer</th>
                <th>Next step</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.registrationNo}</td>
                  <td className={grant.showCustomer ? "" : "pt-mask"}>{r.customer}</td>
                  <td>
                    <Chip tone={r.overdue ? "bad" : r.due ? "warn" : "neutral"}>{r.label}</Chip>
                  </td>
                  <td className="muted">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    // ---- Recent activity -------------------------------------------------
    case "RECENT_ACTIVITY": {
      const rows = view.activity;
      if (!rows || rows.length === 0) return <Empty what="recorded" />;
      return (
        <ol className="pt-feed">
          {rows.map((e) => (
            <li key={e.id} className="pt-feed-row">
              <span className="pt-feed-when">{timeAgo(e.at)}</span>
              <span className="pt-feed-what">
                <span className="mono">{e.registrationNo}</span>{" "}
                {e.type.toLowerCase().replace(/_/g, " ")}
                {e.actor ? <span className="muted"> · {e.actor}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      );
    }
  }
}

function Figure({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "ok" | "bad";
}) {
  return (
    <div className="pt-figure" data-tone={tone}>
      <span className="pt-figure-label">{label}</span>
      <span className="pt-figure-value tabular-nums">{value}</span>
      {sub && <span className="pt-figure-sub">{sub}</span>}
    </div>
  );
}

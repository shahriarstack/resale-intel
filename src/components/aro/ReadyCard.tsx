"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck, Truck } from "lucide-react";
import { taka, daysSince } from "@/lib/format";
import { vehicleTitle } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import type { RequestRow } from "@/lib/recoveryDesk";

/**
 * An approved capture request, as the officer needs to read it.
 *
 * A PERMIT, not a request. The two look identical on a list and are not the
 * same object: a pending request is a question the officer asked and is
 * waiting on somebody else to answer; an approved one is a job they have been
 * given. Sorting the second to the top of the first — which is what this
 * screen used to do — leaves the only actionable thing on it looking like the
 * three things that are not.
 *
 * So this card drops everything that belonged to the asking. There is no
 * decision history, no withdraw button, no disclosure to open: the officer is
 * about to stand next to this vehicle, and what they need is which one, whose,
 * where, and one button.
 *
 * The account position survives that cut — as one line, not a form. It is the
 * answer to the question the customer asks at the roadside, and an officer who
 * cannot give it is an officer arguing from memory.
 */
export function ReadyCard({ request }: { request: RequestRow }) {
  const waiting = request.decidedAt ? daysSince(request.decidedAt) : null;

  // An approval nobody has acted on. Not an error and not the officer's fault
  // — a vehicle can be hard to find — but a permit sitting unused for a week
  // is a vehicle still earning nothing for somebody else, and nothing else on
  // this screen would ever say so.
  const stale = waiting !== null && waiting >= 3;

  return (
    <article className="ready-card">
      <div className="ready-band">
        <ShieldCheck size={12} strokeWidth={2.4} />
        Cleared to capture
        {waiting !== null && (
          <span className="ready-band-age">
            {waiting === 0 ? "approved today" : `approved ${waiting}d ago`}
          </span>
        )}
      </div>

      <div className="ready-body">
        <div className="ready-head">
          <span className="ready-plate">
            <Truck size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0 flex-1">
            {/* The customer heads the permit. The officer is about to arrive
                somewhere and say whose vehicle they are taking and why —
                the load class is not the answer to either question. */}
            <AccountTitle record={request} className="ready-model" />
            <p className="ready-reg">{request.registrationNo}</p>
          </div>
        </div>

        {/* What used to be Customer / Account, which the heading now says.
            The block keeps its place and its job — the two facts the officer
            needs before they set off that are not the money below — and
            spends it on the vehicle they are looking for and the patch it is
            on, which the meta line no longer has to repeat. */}
        <dl className="ready-facts">
          <div>
            <dt>Vehicle</dt>
            <dd>{vehicleTitle(request)}</dd>
          </div>
          <div>
            <dt>Territory</dt>
            <dd>{request.territory?.name ?? "—"}</dd>
          </div>
        </dl>

        {/* What the customer will ask about, on one line. */}
        <p className="ready-ledger">
          <span>{request.odNumber} instalments overdue</span>
          <span>·</span>
          <span>{taka(request.odAmount)} overdue</span>
          <span>·</span>
          <span>{taka(request.outstandingAmount)} outstanding</span>
        </p>

        <p className="ready-meta">
          <ShieldCheck size={11} />
          {request.decidedBy ? `Approved by ${request.decidedBy.name}` : "Approved by HQ"}
        </p>

        {stale && (
          <p className="ready-stale">
            Still on the road {waiting} days after approval.
          </p>
        )}

        <Link href={`/capture?requestId=${request.id}`} className="btn btn-gradient w-full">
          <Truck size={15} />
          Capture this vehicle
          <ArrowRight size={15} />
        </Link>
      </div>
    </article>
  );
}

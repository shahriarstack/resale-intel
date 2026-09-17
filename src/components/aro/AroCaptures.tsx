"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, FileClock, Hourglass, ShieldCheck, Truck, XCircle } from "lucide-react";
import { AroList, AroSearch, AroTabs, AroHeader, type AroTab } from "@/components/aro/AroList";
import { ActiveCard, CompactCard } from "@/components/aro/CaptureCards";
import { RequestCard } from "@/components/offroad/RequestCard";
import { ReadyCard } from "@/components/aro/ReadyCard";
import { CaseCard } from "@/components/offroad/CaseCard";
import { isCaptureStage, isResaleInventory } from "@/lib/status";
import type { AroBook, CaptureRow, CaseRow, RequestRow } from "@/lib/recoveryDesk";

type Tab = "ready" | "requests" | "declined" | "captured" | "resale" | "closed";

/**
 * Capture management, on its own screen.
 *
 * The repossession half of an officer's day: what they have asked to take,
 * what they are holding, what has moved on to other desks, and what has
 * finished. It is a route rather than a tab because the bottom bar is the only
 * navigation on a phone — nesting a second nav strip inside the page was the
 * thing that made the panel feel like two apps stacked on each other.
 *
 * READY comes first, and it is what the screen opens on. An approved request is
 * not a request any more — it is a permit to go and take a vehicle — and it was
 * previously sorted to the top of a list of three other things that are all
 * waiting on somebody else. The officer's dashboard already sends them here
 * saying "Approved — go and capture"; this is the screen keeping that promise
 * rather than handing them a mixed list to search.
 */
export function AroCaptures({ book }: { book: AroBook }) {
  const { captures, requests, cases, engineers } = book;

  // Cleared to take, right now. Oldest approval first: a permit that has been
  // sitting a week is the one to chase, and the officer works down.
  const ready = useMemo(
    () =>
      requests
        .filter((r) => r.status === "APPROVED")
        .sort((a, b) => (a.decidedAt?.valueOf() ?? 0) - (b.decidedAt?.valueOf() ?? 0)),
    [requests],
  );

  // Land on the thing with an action attached. Anything cleared to capture
  // outranks a list of files already being worked — and when there is nothing
  // to take, the screen opens where it always did.
  const [tab, setTab] = useState<Tab>(ready.length > 0 ? "ready" : "captured");
  const [search, setSearch] = useState("");

  const b = useMemo(() => {
    // The Credit Note is the boundary. Before it a vehicle is a capture the
    // officer is still working; after it the write-off is authorised and the
    // vehicle is resale stock moving towards a sale. They are different jobs
    // and they get different tabs.
    const captured: CaptureRow[] = [];
    const resale: CaptureRow[] = [];
    const closed: (CaptureRow | CaseRow)[] = [];
    for (const v of captures) {
      if (isCaptureStage(v.status)) captured.push(v);
      else if (isResaleInventory(v.status)) resale.push(v);
      else closed.push(v);
    }
    for (const c of cases) if (c.status !== "OPEN") closed.push(c);

    return {
      /**
       * REQUESTS IS THE WAITING ROOM, AND NOTHING ELSE.
       *
       * It used to hold every request that was not approved — declined ones,
       * withdrawn ones, and the ones whose approval had already been used to
       * take a vehicle. So the tab an officer opens to see whether HQ has
       * answered them was mostly answers from weeks ago, and the count beside
       * it was a number they had to read past rather than act on.
       *
       * Every one of those states has somewhere better to be. An APPROVED
       * request is a permit and sits in Ready. A CAPTURED one did its job and
       * became a vehicle — it is in Captured, as the thing itself rather than
       * as the paperwork that asked for it. What is refused or pulled goes to
       * Declined below, which is a record rather than a queue.
       *
       * What is left is one question: what is HQ still sitting on.
       */
      requests: requests.filter((r) => r.status === "PENDING"),

      /**
       * The requests that ended without a capture.
       *
       * DECLINED and WITHDRAWN together, newest first, because this is a
       * history and the useful end of a history is the recent one. They are
       * two different endings — HQ refused, or the officer pulled it because
       * the customer paid — and the card states which, so the tab does not
       * have to. What they have in common is the only thing this tab is for:
       * the file is closed and no vehicle came of it.
       *
       * Withdrawn ones are here rather than nowhere. Dropping them would make
       * an officer's own retraction vanish from their screen the moment they
       * made it, which is the one outcome where they are most likely to go
       * back and check what they did.
       */
      declined: requests
        .filter((r) => r.status === "DECLINED" || r.status === "WITHDRAWN")
        .sort(
          (x, y) =>
            (y.decidedAt ?? y.requestedAt).valueOf() -
            (x.decidedAt ?? x.requestedAt).valueOf(),
        ),

      liveRequests: requests.filter((r) => r.status === "PENDING").length,
      // Whatever is owed soonest to the top — the officer works down.
      captured: [...captured].sort(
        (x, y) =>
          Number(y.next.due) - Number(x.next.due) ||
          y.letters.overdueCount - x.letters.overdueCount,
      ),
      resale,
      closed,
    };
  }, [captures, cases, requests]);

  const q = search.trim().toLowerCase();
  const hit = (row: {
    registrationNo: string;
    make: string | null;
    model: string | null;
    customerName: string;
    territory: { name: string } | null;
  }) =>
    !q ||
    row.registrationNo.toLowerCase().includes(q) ||
    (row.make ?? "").toLowerCase().includes(q) ||
    (row.model ?? "").toLowerCase().includes(q) ||
    row.customerName.toLowerCase().includes(q) ||
    (row.territory?.name ?? "").toLowerCase().includes(q);

  const tabs: AroTab[] = [
    { key: "ready", label: "Ready", count: ready.length },
    { key: "requests", label: "Awaiting", count: b.liveRequests },
    { key: "declined", label: "Declined", count: b.declined.length },
    { key: "captured", label: "Captured", count: b.captured.length },
    { key: "resale", label: "In resale", count: b.resale.length },
    { key: "closed", label: "Closed", count: b.closed.length },
  ];

  return (
    <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-4">
      <AroHeader
        eyebrow="Repossession track"
        title="Captures"
        sub="What you have asked for, what you are holding, and what has cleared its Credit Note into resale."
      />
      <AroSearch value={search} onChange={setSearch} />
      <AroTabs tabs={tabs} value={tab} onChange={(k) => setTab(k as Tab)} />

      <AroList>
        {tab === "ready" && (
          <AroList.Rows
            rows={ready.filter(hit)}
            empty="Nothing cleared to capture. An approved request lands here the moment HQ rules on it."
            icon={ShieldCheck}
            searching={!!q}
            render={(r: RequestRow) => <ReadyCard key={r.id} request={r} />}
          />
        )}
        {tab === "requests" && (
          <AroList.Rows
            rows={b.requests.filter(hit)}
            empty="Nothing waiting on HQ. Raise a request before you take a vehicle."
            icon={FileClock}
            searching={!!q}
            render={(r: RequestRow) => (
              <RequestCard key={r.id} request={r} canDecide={false} canWithdraw />
            )}
          />
        )}
        {tab === "declined" && (
          <AroList.Rows
            rows={b.declined.filter(hit)}
            empty="Nothing refused or pulled. Requests HQ turns down are kept here with the reason."
            icon={XCircle}
            searching={!!q}
            /* No withdraw button. There is nothing left to pull — the request
               is already finished, and offering the control would be offering
               an action that can only fail. */
            render={(r: RequestRow) => (
              <RequestCard key={r.id} request={r} canDecide={false} canWithdraw={false} />
            )}
          />
        )}
        {tab === "captured" && (
          <AroList.Rows
            rows={b.captured.filter(hit)}
            empty="Nothing captured right now. Tap Add vehicle to start one."
            icon={Truck}
            searching={!!q}
            render={(v: CaptureRow) => (
              <ActiveCard key={v.id} vehicle={v} engineers={engineers} />
            )}
          />
        )}
        {tab === "resale" && (
          <AroList.Rows
            rows={b.resale.filter(hit)}
            empty="Nothing has cleared its Credit Note yet."
            icon={Hourglass}
            searching={!!q}
            render={(v: CaptureRow) => <CompactCard key={v.id} vehicle={v} />}
          />
        )}
        {tab === "closed" && (
          <AroList.Rows
            rows={b.closed.filter(hit)}
            empty="Nothing closed yet — released vehicles and resolved cases land here."
            icon={CheckCircle2}
            searching={!!q}
            render={(row: CaptureRow | CaseRow) =>
              "kind" in row ? (
                <CaseCard key={row.id} kase={row} viewer="field" readOnly />
              ) : (
                <CompactCard key={row.id} vehicle={row} />
              )
            }
          />
        )}
      </AroList>

    </div>
  );
}

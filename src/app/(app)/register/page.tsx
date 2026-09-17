import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { canPlaceBid, canViewAllBids, isStorefrontRole, offerLevel } from "@/lib/rbac";
import { readCycle, isFreshListing } from "@/lib/resale";
import { locationName, vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { liveOffers, type OfferRow } from "@/lib/bids";
import { OFFER_SELECT, shapeOffer } from "@/lib/offerQuery";
import { buildGallery } from "@/lib/photos";
import { Storefront, type Listing } from "@/components/register/Storefront";

export const dynamic = "force-dynamic";

// Which photographs a listing shows, and what the buyer is told about them,
// both come from lib/photos. A repaired vehicle is sold from the engineer's
// post-repair set; an as-is vehicle is sold from the recovery set, labelled as
// such. Paperwork never reaches the shop window.

export default async function RegisterPage({
  searchParams,
}: {
  // ?v=<id> opens that vehicle's listing straight away. Sales officers are
  // redirected here from a vehicle link, and landing on an unfiltered grid
  // after clicking one specific truck would lose them.
  searchParams: Promise<{ v?: string }>;
}) {
  const { v: openId } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const seesAllOffers = canViewAllBids(user.role);
  const storefront = isStorefrontRole(user.role);

  const vehicles = await prisma.vehicle.findMany({
    where: { status: { in: ["LIVE_FOR_RESALE", "SOLD"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      costing: { select: { approvedPrice: true, repairNote: true } },
      territory: { select: { name: true } },
      currentLocation: { select: { name: true } },
      photos: { select: { slot: true, url: true } },
      bids: { orderBy: { createdAt: "desc" }, select: OFFER_SELECT },
    },
  });

  // The roster the offer form picks from. Sales works one shared marketplace,
  // so whoever is at the screen has to say whose customer an offer is — and
  // the list is small enough to ship with the page rather than fetch on open.
  const salesOfficers = await prisma.user.findMany({
    where: { role: "SALES_TEAM", isActive: true },
    orderBy: [{ salesTerritory: "asc" }, { name: "asc" }],
    select: { id: true, name: true, staffId: true, salesTerritory: true },
  });

  const data: Listing[] = vehicles.map((v) => {
    const offers: OfferRow[] = v.bids.map((x) => shapeOffer(x, user.id));

    const live = liveOffers(offers);
    const mine = live.filter((o) => o.isMine);
    const sold = v.status === "SOLD";
    // A listed vehicle whose pricing month has run out is visible but closed.
    const cycle = readCycle(v.resaleCycleEndsAt);
    const winning = sold ? offers.find((x) => x.id === v.winningBidId) ?? null : null;
    const { shots, provenance } = buildGallery(v.photos, v.asIs);
    // An as-is vehicle is sold with its faults known and unrepaired. Saying so
    // in the listing is not a courtesy: the estimate that documents them is the
    // reason the price is what it is, and a buyer who finds out afterwards is
    // a buyer who does not come back.
    //
    // The engineer now writes one line rather than itemising, so the
    // disclosure is that line, split on the separators people actually use.
    const knownFaults =
      v.asIs && v.costing?.repairNote
        ? v.costing.repairNote
            .split(/[;\n]|,\s/)
            .map((f) => f.trim())
            .filter(Boolean)
        : [];

    return {
      id: v.id,
      title: vehicleTitle(v),
      make: vehicleMake(v),
      year: v.year,
      mileage: v.mileage,
      registrationNo: v.registrationNo,
      registrationValidUntil: v.registrationValidUntil?.toISOString() ?? null,
      grade: v.grade,
      territory: v.territory?.name ?? null,
      // Where the vehicle physically IS. The one a buyer asks about, and a
      // different question from the recovery territory above — that is the
      // ARO's patch, which says who seized it, not where it is parked.
      location: locationName(v),
      hasSleeperCabin: v.hasSleeperCabin,
      listedAt: v.updatedAt.toISOString(),
      isNew: !sold && isFreshListing(v.updatedAt),
      images: shots,
      provenance,
      knownFaults,
      price: v.costing?.approvedPrice ?? null,
      sold,
      onHold: !sold && cycle.onHold,

      // An officer always reads back what they submitted, whatever their role.
      myOffers: mine,

      // The book itself is management-only while the sale is open. Field roles
      // get a count of *their own* offers and nothing about anyone else's.
      offers: seesAllOffers ? live : [],
      offerCount: seesAllOffers ? live.length : null,
      topOffer: seesAllOffers ? live[0]?.amount ?? null : null,

      // Once a sale closes the outcome is public to the team.
      soldAt: v.soldAt?.toISOString() ?? null,
      soldAmount: winning?.amount ?? null,
      soldCustomer: winning?.customerName ?? null,
      soldVia: winning?.officerName ?? null,
      iBroughtIt: winning ? winning.isMine : false,
    };
  });

  return (
    <Storefront
      listings={data}
      canOffer={canPlaceBid(user.role, "LIVE_FOR_RESALE")}
      seesOfferBook={seesAllOffers}
      storefront={storefront}
      viewerLevel={offerLevel(user.role)}
      openId={openId ?? null}
      salesOfficers={salesOfficers}
      viewerId={user.id}
    />
  );
}

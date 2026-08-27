import { redirect } from "next/navigation";
import type { PhotoSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { computeBreakdown } from "@/lib/costing";
import { canPlaceBid, canViewAllBids } from "@/lib/rbac";
import { vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { standingOffers, type BidRow } from "@/lib/bids";
import { RegisterClient, type MarketVehicle } from "@/components/register/RegisterClient";

export const dynamic = "force-dynamic";

// Which shot best represents the vehicle on a listing card.
const HERO_ORDER: PhotoSlot[] = ["FRONT", "LEFT", "RIGHT", "BACK", "CABIN", "SLEEP"];

function heroPhoto(photos: { slot: PhotoSlot; url: string }[]): string | null {
  for (const slot of HERO_ORDER) {
    const hit = photos.find((p) => p.slot === slot);
    if (hit) return hit.url;
  }
  return photos[0]?.url ?? null;
}

export default async function RegisterPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const seesAllBids = canViewAllBids(user.role);

  const vehicles = await prisma.vehicle.findMany({
    where: { status: { in: ["LIVE_FOR_RESALE", "SOLD"] } },
    orderBy: { updatedAt: "desc" },
    include: {
      costing: true,
      repairLines: { select: { amount: true } },
      regLines: { select: { amount: true } },
      territory: { select: { name: true } },
      photos: { select: { slot: true, url: true } },
      bids: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          note: true,
          createdAt: true,
          bidderId: true,
          bidder: { select: { name: true, staffId: true } },
        },
      },
    },
  });

  const data: MarketVehicle[] = vehicles.map((v) => {
    const b = computeBreakdown(v.costing, v.repairLines, v.regLines);

    const allBids: BidRow[] = v.bids.map((x) => ({
      id: x.id,
      amount: x.amount,
      note: x.note,
      createdAt: x.createdAt.toISOString(),
      bidderId: x.bidderId,
      bidderName: x.bidder.name,
      bidderStaffId: x.bidder.staffId,
      isMine: x.bidderId === user.id,
    }));

    const offers = standingOffers(allBids);
    const mine = offers.find((o) => o.isMine) ?? null;
    const sold = v.status === "SOLD";
    const winning = sold ? allBids.find((x) => x.id === v.winningBidId) ?? null : null;

    return {
      id: v.id,
      title: vehicleTitle(v),
      make: vehicleMake(v),
      year: v.year,
      mileage: v.mileage,
      registrationNo: v.registrationNo,
      grade: v.grade,
      territory: v.territory?.name ?? null,
      updatedAt: v.updatedAt.toISOString(),
      imageUrl: heroPhoto(v.photos),
      photoCount: v.photos.length,
      approvedPrice: b.approvedPrice,
      sold,

      // Own bid is always visible to the person who placed it.
      myBid: mine ? { amount: mine.amount, createdAt: mine.createdAt } : null,
      myBidCount: allBids.filter((x) => x.isMine).length,

      // Sealed: the size of the book is management-only while bidding is open.
      topBid: seesAllBids ? offers[0]?.amount ?? null : null,
      bidderCount: seesAllBids ? offers.length : null,

      // Once a sale closes the outcome is public to the team.
      soldAt: v.soldAt?.toISOString() ?? null,
      winningAmount: winning?.amount ?? null,
      winnerName: winning?.bidderName ?? null,
      iWon: winning ? winning.isMine : null,
    };
  });

  return (
    <RegisterClient
      vehicles={data}
      canBid={canPlaceBid(user.role, "LIVE_FOR_RESALE")}
      seesAllBids={seesAllBids}
    />
  );
}

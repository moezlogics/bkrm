import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Favourite from "@/models/Favourite";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { ListingCard } from "@/components/ListingCard";
import { AppBar } from "@/components/layout/AppChrome";
import { CARD_SELECT, CARD_SELLER_SELECT, toCards } from "@/lib/listing-card";
import { Heart } from "lucide-react";
import { VERTICAL } from "@/vertical";

export const metadata = { title: "Saved ads", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function SavedAdsPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?callbackUrl=/dashboard/saved");

  await dbConnect();
  const favs = await Favourite.find({ userId: session.userId }).sort({ createdAt: -1 }).limit(100).select("itemId").lean();
  const ids = favs.map((f: any) => f.itemId).filter(Boolean);
  const docs = ids.length
    ? await Listing.find({ _id: { $in: ids } }).select(`${CARD_SELECT} status`)
        .populate({ path: "userId", model: User, select: CARD_SELLER_SELECT }).lean()
    : [];
  // Keep the order they were saved in; ads deleted since are skipped.
  const byId = new Map(docs.map((d: any) => [String(d._id), d]));
  const ordered = ids.map((id: any) => byId.get(String(id))).filter(Boolean);
  const cards = toCards(ordered as any[]);
  const gone = ordered.filter((d: any) => d.status !== "approved").length;

  return (
    <>
      <AppBar title="Saved ads" subtitle={cards.length ? `${cards.length} saved` : undefined} backHref="/dashboard" />
      <div className="max-w-3xl mx-auto w-full px-4 py-4 pb-10">
        {cards.length ? (
          <>
            {gone > 0 && <p className="text-[11px] text-content-tertiary mb-2">{gone} of these {gone === 1 ? "is" : "are"} sold or no longer live.</p>}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {cards.map((ad: any) => <ListingCard key={ad._id} ad={ad} />)}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-card-border bg-card p-10 text-center mt-4">
            <Heart className="h-9 w-9 text-content-tertiary mx-auto mb-3" />
            <p className="text-sm font-semibold text-content">No saved ads yet</p>
            <p className="text-xs text-content-secondary mt-1">Tap the heart on any ad to keep it here.</p>
            <Link href={`/${VERTICAL.primaryTop}`} className="mt-4 inline-block rounded-lg bg-primary text-white font-semibold text-sm px-6 py-2.5 hover:bg-primary-dark">Browse ads</Link>
          </div>
        )}
      </div>
    </>
  );
}

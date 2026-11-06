import React from "react";
import Image from "next/image";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import { sellerReviews } from "@/lib/reviews";
import { notFound } from "next/navigation";
import { MapPin, Package, Star, ShieldCheck } from "lucide-react";
import { ListingCard } from "@/components/ListingCard";
import { ReviewSection } from "./ReviewSection";
import { ReportButton } from "@/components/ReportButton";
import { TrustMark } from "@/components/TrustMark";

async function getShop(idOrSlug: string) {
  await dbConnect();
  const q: any = mongoose.Types.ObjectId.isValid(idOrSlug) ? { _id: idOrSlug } : { shopSlug: idOrSlug };
  const shop = await User.findOne(q)
    .select("name shopName shopAddress shopLogo shopBanner shopDescription bio profileImage rating ratingCount salesCount verificationLevel verificationStatus emailVerified provider phoneNumber isShop createdAt city")
    .lean();
  if (!shop) return null;

  const [listings, reviews] = await Promise.all([
    Listing.find({ userId: shop._id, status: "approved" })
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(60)
      .select("name slug price mainImage galleryImages condition city customFieldValues isFeatured whatsappNumber contactNumber createdAt")
      .lean(),
    sellerReviews(String(shop._id)),
  ]);

  return { shop: JSON.parse(JSON.stringify(shop)), listings: JSON.parse(JSON.stringify(listings)), reviews: JSON.parse(JSON.stringify(reviews)) };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getShop(slug);
  if (!data) return { title: "Seller not found" };
  const name = data.shop.shopName || data.shop.name;
  return { title: `${name} — seller profile`, robots: { index: false, follow: true } };
}

export default async function ShopPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getShop(slug);
  if (!data) notFound();
  const { shop, listings, reviews } = data;
  const name = shop.shopName || shop.name;

  return (
    <div className="wrap max-w-5xl mx-auto py-5 pb-mobile-nav">
      {shop.shopBanner && (
        <div className="relative aspect-[3/1] rounded-xl overflow-hidden mb-3 bg-surface-secondary border border-card-border">
          <Image src={shop.shopBanner} alt="" fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" priority />
        </div>
      )}
      {/* Profile header */}
      <div className="rounded-lg sm:rounded-xl border border-card-border bg-card p-4 sm:p-5 flex items-start gap-4 shadow-xs">
        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-lg sm:rounded-xl bg-primary/10 text-primary grid place-items-center overflow-hidden shrink-0 font-semibold text-2xl border border-primary/20">
          {shop.shopLogo || shop.profileImage ? <Image src={shop.shopLogo || shop.profileImage} alt="" width={80} height={80} className="h-full w-full object-cover" /> : (name?.[0]?.toUpperCase() || "S")}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold text-content">{name}</h1>
            <TrustMark user={shop} size={20} withLabel />
          </div>
          {(shop.ratingCount || 0) > 0 && (
            <div className="flex items-center gap-1 text-sm mt-0.5">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-bold text-content">{shop.rating?.toFixed(1)}</span>
              <span className="text-content-secondary">({shop.ratingCount} reviews)</span>
            </div>
          )}
          <div className="flex items-center gap-3 text-xs text-content-secondary flex-wrap mt-1">
            {shop.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{shop.city}</span>}
            <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{listings.length} active</span>
            {shop.salesCount ? <span>{shop.salesCount} sold</span> : null}
            <span>Member since {new Date(shop.createdAt).getFullYear()}</span>
          </div>
          {(shop.shopDescription || shop.bio) && <p className="text-sm text-content-secondary mt-2 whitespace-pre-line">{shop.shopDescription || shop.bio}</p>}
          <div className="mt-2">
            <ReportButton type="seller" reportedUserId={shop._id} label="Report seller" />
          </div>
        </div>
      </div>

      {(shop.verificationLevel || 0) >= 2 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 shadow-xs">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" /> {(shop.verificationLevel || 0) >= 3 ? "Verified shop — the owner's ID was checked by our team." : "Verified seller — their ID was checked by our team."}
        </div>
      )}

      {/* Listings */}
      <h2 className="text-base sm:text-lg font-bold text-content mb-3 mt-6">Listings</h2>
      {listings.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {listings.map((item: any) => <ListingCard key={item._id} ad={item} />)}
        </div>
      ) : (
        <p className="text-sm text-content-secondary py-8 text-center rounded-xl border border-dashed border-card-border bg-surface-secondary">This seller has no active listings yet.</p>
      )}

      {/* Reviews */}
      <ReviewSection sellerId={shop._id} sellerName={name} initial={reviews} />
    </div>
  );
}

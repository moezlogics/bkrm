import React from "react";
import { notFound, redirect } from "next/navigation";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import Category from "@/models/Category";
import Area from "@/models/Area";
import { getServerSession } from "@/lib/auth";
import { PostWizard, type EditInit } from "../../post/PostWizard";
import { getWizardData } from "../../post/wizard-data";
import { plainCustomFields } from "@/lib/utils";

export const metadata = { title: "Edit ad", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

export default async function EditAdPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getServerSession();
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/ads/${slug}/edit`)}`);

  await dbConnect();
  const ad: any = await Listing.findOne({ slug }).lean();
  if (!ad) notFound();
  if (String(ad.userId) !== session.userId && session.role !== "admin") redirect(`/ads/${slug}`);

  const catIds: string[] = (ad.allCategoryIds || []).map(String);
  const [cats, areaDoc, data] = await Promise.all([
    Category.find({ _id: { $in: catIds } }).select("name").lean(),
    ad.locationRefs?.areaId ? Area.findById(ad.locationRefs.areaId).select("name").lean() : null,
    getWizardData(),
  ]);
  const byId = new Map((cats as any[]).map((c) => [String(c._id), c.name]));

  const edit: EditInit = {
    id: String(ad._id),
    slug: ad.slug,
    topId: catIds[0] || String(ad.categoryId),
    categoryLabel: catIds.map((id) => byId.get(id)).filter(Boolean).join(" › "),
    title: ad.name || "",
    description: ad.description || "",
    price: ad.price != null ? String(ad.price) : "",
    negotiable: ad.priceMode !== "fixed",
    condition: ad.condition || "",
    customFields: plainCustomFields(ad.customFieldValues) as Record<string, any>,
    images: (ad.galleryImages?.length ? ad.galleryImages : ad.mainImage ? [ad.mainImage] : []) as string[],
    city: ad.city || "",
    area: (areaDoc as any)?.name || "",
    phone: ad.contactNumber || "",
    whatsapp: ad.whatsappNumber || "",
    videoLink: ad.videoLink || "",
    isUrgent: !!ad.isUrgent,
  };

  return <PostWizard {...data} edit={edit} />;
}

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Media from "@/models/Media";
import Listing from "@/models/Listing";
import Slider from "@/models/Slider";
import BlogPost from "@/models/BlogPost";
import Category from "@/models/Category";
import City from "@/models/City";
import Setting from "@/models/Setting";
import User from "@/models/User";
import { deleteStored } from "@/lib/storage";
import { toMediaItem } from "@/lib/media";
import { cdnPatchMeta } from "@/lib/cdn-client";

type Ctx = { params: Promise<{ id: string }> };

async function load(id: string, userId: string, isAdmin: boolean) {
  if (!mongoose.isValidObjectId(id)) return null;
  const doc = await Media.findById(id);
  if (!doc) return null;
  if (!isAdmin && String(doc.uploadedBy) !== userId) return null;
  return doc;
}

/** PATCH /api/media/:id — { title?, alt?, caption? } (also saved on the CDN) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  await dbConnect();
  const doc = await load(id, session.userId, session.role === "admin");
  if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  if (typeof b.title === "string") doc.title = b.title.trim().slice(0, 120);
  if (typeof b.alt === "string" && b.alt.trim() !== doc.alt) { doc.alt = b.alt.trim().slice(0, 200); doc.altSource = "user"; }
  if (typeof b.caption === "string") doc.caption = b.caption.trim().slice(0, 300);
  await doc.save();
  // Keep the CDN's own metadata (served to other sites) in step — best effort.
  if (doc.driver === "cdn" && !doc.isPrivate) await cdnPatchMeta(doc.key, { alt: doc.alt, title: doc.title, caption: doc.caption }).catch(() => {});
  return NextResponse.json({ success: true, data: toMediaItem(doc) });
}

/**
 * DELETE /api/media/:id[?force=1]
 * Refuses (409 + where) when the image is still used on a live ad, the site
 * settings (logo …), a slider, blog post, category or city — deleting it would
 * leave a broken image there. `force=1` deletes anyway.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  await dbConnect();
  const doc = await load(id, session.userId, session.role === "admin");
  if (!doc) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });

  if (req.nextUrl.searchParams.get("force") !== "1") {
    const urls = [doc.url, doc.thumbUrl];
    const [ads, settings, sliders, posts, cats, cities, users] = await Promise.all([
      // Ads only use photos their own seller uploaded: checking that seller's
      // ads (userId index) instead of scanning every listing on the site.
      Listing.countDocuments({
        ...(doc.uploadedBy ? { userId: doc.uploadedBy } : {}),
        $or: [{ mainImage: { $in: urls } }, { galleryImages: { $in: urls } }],
      }).maxTimeMS(5000),
      Setting.countDocuments({ value: { $in: urls } }),
      Slider.countDocuments({ image: { $in: urls } }),
      BlogPost.countDocuments({ coverImage: { $in: urls } }),
      Category.countDocuments({ $or: [{ image: { $in: urls } }, { icon: { $in: urls } }] }),
      City.countDocuments({ image: { $in: urls } }),
      User.countDocuments({ $or: [{ profileImage: { $in: urls } }, { shopLogo: { $in: urls } }, { shopBanner: { $in: urls } }] }),
    ]);
    const where = [
      ads && `${ads} ad${ads > 1 ? "s" : ""}`, settings && "site settings", sliders && "a slider", posts && "a blog post",
      cats && "a category", cities && "a city", users && "a profile",
    ].filter(Boolean);
    if (where.length) {
      return NextResponse.json({ success: false, code: "in-use", inUse: where, message: `This image is used in ${where.join(", ")}.` }, { status: 409 });
    }
  }

  await deleteStored(doc);
  await doc.deleteOne();
  return NextResponse.json({ success: true });
}

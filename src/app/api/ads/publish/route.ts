import { NextRequest, NextResponse, after } from "next/server";
import mongoose from "mongoose";
import slugify from "slugify";
import { warmImages } from "@/lib/warm-images";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import City from "@/models/City";
import Area from "@/models/Area";
import User from "@/models/User";
import { getServerSession } from "@/lib/auth";
import { scoreListing } from "@/lib/spam";
import { aiScreenListing } from "@/lib/spam-ai";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { listingLimitReached } from "@/lib/plan";
import { prepareAd, learnOptions, AdFormError, type PreparedAd } from "@/lib/ad-form";

/**
 * The sell wizard's endpoint.
 *  POST          create an ad (publishes instantly unless the spam check holds it)
 *  PUT ?id=…     edit your ad (all details — photos, specs, price, location, contact)
 * Validation and "learning" (new cities/areas, new spec options) live in lib/ad-form.
 */

async function screen(p: PreparedAd, images: string[]) {
  const f = p.fields;
  const specs = Object.fromEntries(f.customFieldValues as Map<string, any>);
  const heur = scoreListing({
    title: f.name, description: f.description, price: f.price, categoryTopSlug: p.topSlug, images,
    contactNumber: f.contactNumber, whatsappNumber: f.whatsappNumber, condition: f.condition,
  });
  const ai = await aiScreenListing({ title: f.name, description: f.description, price: f.price, currency: "PKR", category: p.leafName, condition: f.condition, specs });
  let spamScore = heur.score;
  let flagReasons = heur.reasons.slice();
  let hold = heur.action === "review";
  if (ai) {
    spamScore = Math.max(spamScore, ai.risk);
    if (ai.reasons.length) flagReasons = [...flagReasons, ...ai.reasons.map((r) => `AI: ${r}`)];
    if (ai.block) hold = true;
  }
  return { spamScore, flagReasons, hold };
}

const fail = (e: unknown) => {
  if (e instanceof AdFormError) return NextResponse.json({ success: false, message: e.message, field: e.field }, { status: e.status });
  console.error("Ad form error:", e);
  return NextResponse.json({ success: false, message: "Something went wrong — please try again" }, { status: 500 });
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, message: "Please log in to post an ad" }, { status: 401 });
    const b = await req.json();
    await dbConnect();

    const limit = await listingLimitReached(session.userId);
    if (limit) return NextResponse.json({ success: false, code: "limit", message: limit }, { status: 403 });

    const p = await prepareAd(b, session.userId);
    const f = p.fields;

    const listingId = new mongoose.Types.ObjectId();
    const uniqueId = listingId.toString().slice(-6);
    const base = slugify(f.name, { lower: true, strict: true }).slice(0, 70) || "listing";
    const slug = `${base}-${uniqueId}`;

    const { spamScore, flagReasons, hold } = await screen(p, f.galleryImages);
    const status = hold ? "review" : "approved";

    const listing = await Listing.create({
      _id: listingId,
      ...f,
      slug,
      userId: session.userId,
      status,
      spamScore,
      flagReasons,
      isFeatured: false,
    });

    const refs = f.locationRefs;
    if (refs.cityId) City.updateOne({ _id: refs.cityId }, { $inc: { listingCount: 1 } }).catch(() => {});
    if (refs.areaId) Area.updateOne({ _id: refs.areaId }, { $inc: { listingCount: 1 } }).catch(() => {});
    // Posting makes the account a seller account.
    User.updateOne({ _id: session.userId, isSeller: { $ne: true } }, { $set: { isSeller: true } }).catch(() => {});
    // The number on the ad becomes the account's number when it has none, so
    // a seller never types it twice (one account per number, as on sign-up).
    if (/^03\d{9}$/.test(String(f.contactNumber || ""))) {
      User.exists({ _id: { $ne: session.userId }, phoneNumber: f.contactNumber })
        .then((taken) => taken ? null : User.updateOne({ _id: session.userId, $or: [{ phoneNumber: null }, { phoneNumber: "" }] }, { $set: { phoneNumber: f.contactNumber } }))
        .catch(() => {});
    }
    after(() => learnOptions(p.newOptions));

    notifyDiscord({
      title: status === "review" ? "New listing held for review (spam check)" : "New listing posted",
      category: status === "review" ? "review" : "listings",
      description: `**${listing.name}** — Rs ${Number(f.price).toLocaleString()}`,
      url: `/ads/${listing.slug}`,
      color: status === "review" ? DISCORD_COLORS.report : DISCORD_COLORS.listing,
      fields: [
        { name: "Category", value: p.leafName, inline: true },
        { name: "City", value: f.city, inline: true },
        { name: "Spam score", value: `${spamScore}/100`, inline: true },
        ...(p.createdPlaces.length ? [{ name: "New places added", value: p.createdPlaces.join(", ") }] : []),
        ...(p.newOptions.length ? [{ name: "New spec options", value: p.newOptions.flatMap((o) => o.values).join(", ") }] : []),
        ...(flagReasons.length ? [{ name: "Flags", value: flagReasons.join(", ") }] : []),
      ],
    });

    if (status === "approved") after(() => warmImages(listing.mainImage, listing.galleryImages));

    return NextResponse.json({
      success: true,
      held: status === "review",
      message: status === "review" ? "Your ad was submitted for review — our team is checking it for safety." : "Your ad is now live!",
      data: { slug: listing.slug, id: listing._id.toString(), status },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ success: false, message: "Please log in again" }, { status: 401 });
    const id = req.nextUrl.searchParams.get("id") || "";
    if (!mongoose.isValidObjectId(id)) return NextResponse.json({ success: false, message: "Ad not found" }, { status: 404 });

    await dbConnect();
    const existing: any = await Listing.findById(id);
    if (!existing) return NextResponse.json({ success: false, message: "Ad not found" }, { status: 404 });
    const isAdmin = session.role === "admin";
    if (String(existing.userId) !== session.userId && !isAdmin) {
      return NextResponse.json({ success: false, message: "You can only edit your own ads" }, { status: 403 });
    }

    const b = await req.json();
    const p = await prepareAd(b, session.userId, existing);
    const f = p.fields;

    // Re-screen when the wording changed; an edit mustn't sneak spam past review.
    let status = existing.status;
    let spam = { spamScore: existing.spamScore, flagReasons: existing.flagReasons };
    if (!isAdmin && (f.name !== existing.name || f.description !== existing.description || f.price !== existing.price)) {
      const s = await screen(p, f.galleryImages);
      spam = { spamScore: s.spamScore, flagReasons: s.flagReasons };
      if (s.hold && status === "approved") status = "review";
    }
    // A rejected ad the seller has fixed goes back to the review queue (it
    // stays hidden until an admin approves it).
    // That makes it count against the seller's live-ad limit again.
    if (!isAdmin && status === "rejected") {
      const limit = await listingLimitReached(String(existing.userId));
      if (limit) return NextResponse.json({ success: false, code: "limit", message: limit }, { status: 403 });
      status = "review";
    }

    const oldRefs = existing.locationRefs || {};
    Object.assign(existing, f, { status, ...spam });
    await existing.save();

    if (String(oldRefs.cityId || "") !== String(f.locationRefs.cityId || "")) {
      if (oldRefs.cityId) City.updateOne({ _id: oldRefs.cityId }, { $inc: { listingCount: -1 } }).catch(() => {});
      City.updateOne({ _id: f.locationRefs.cityId }, { $inc: { listingCount: 1 } }).catch(() => {});
    }
    after(() => learnOptions(p.newOptions));
    if (status === "approved") after(() => warmImages(existing.mainImage, existing.galleryImages));

    return NextResponse.json({
      success: true,
      held: status === "review",
      message: status === "review" ? "Saved — your changes are being reviewed before they go live." : "Your changes are live",
      data: { slug: existing.slug, id: existing._id.toString(), status },
    });
  } catch (e) {
    return fail(e);
  }
}

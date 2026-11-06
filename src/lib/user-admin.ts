/**
 * Account actions behind Admin → Users that touch more than the user record:
 * hiding a blocked seller's ads (and putting them back), and deleting an
 * account together with everything that belongs to it.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import Favourite from "@/models/Favourite";
import Offer from "@/models/Offer";
import ChatMessage from "@/models/ChatMessage";
import Review from "@/models/Review";
import BlockedUser from "@/models/BlockedUser";
import Media from "@/models/Media";
import PushSubscriber from "@/models/PushSubscriber";
import PushJob from "@/models/PushJob";
import UserReport from "@/models/UserReport";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import { deleteStored } from "@/lib/storage";
import { markCountsStale } from "@/lib/scope-counts";
import { forgetAccount } from "@/lib/account-state";

/** Written on ads hidden because their seller was blocked, so unblocking can bring back exactly those. */
export const BLOCK_REASON = "Seller account blocked";

const oid = (id: unknown) => new mongoose.Types.ObjectId(String(id));

/** Take a seller's live ads off the site. Returns how many were hidden. */
export async function hideSellerAds(userId: unknown): Promise<number> {
  await dbConnect();
  const r = await Listing.updateMany(
    { userId: oid(userId), status: "approved" },
    { $set: { status: "rejected", blockHidden: true }, $addToSet: { flagReasons: BLOCK_REASON } },
  );
  if (r.modifiedCount) markCountsStale();
  return r.modifiedCount;
}

/** Put back the ads that blocking hid (not ones a moderator rejected). */
export async function restoreSellerAds(userId: unknown): Promise<number> {
  await dbConnect();
  const r = await Listing.updateMany(
    { userId: oid(userId), status: "rejected", blockHidden: true },
    { $set: { status: "approved" }, $unset: { blockHidden: "" }, $pull: { flagReasons: BLOCK_REASON } },
  );
  if (r.modifiedCount) markCountsStale();
  return r.modifiedCount;
}

export interface DeleteSummary {
  listings: number;
  media: number;
  messages: number;
}

/**
 * Delete an account and what belongs to it: its ads (with their saves,
 * offers, chats and reports), its photos and documents, its messages,
 * reviews, saved ads, devices and plans. Invoices stay — they are the
 * site's payment records.
 */
export async function deleteAccount(userId: unknown): Promise<DeleteSummary> {
  await dbConnect();
  const id = oid(userId);
  const listingIds = (await Listing.find({ userId: id }).select("_id").lean()).map((l: any) => l._id);
  const media: any[] = await Media.find({ uploadedBy: id }).select("key driver").lean();

  // Files first: once the rows are gone nothing points at them any more.
  await Promise.all(media.map((m) => deleteStored(m).catch(() => {})));

  const [, , , , msgs] = await Promise.all([
    Listing.deleteMany({ userId: id }),
    Favourite.deleteMany({ $or: [{ userId: id }, { itemId: { $in: listingIds } }] }),
    Offer.deleteMany({ $or: [{ buyerId: id }, { sellerId: id }, { itemId: { $in: listingIds } }] }),
    UserReport.deleteMany({ $or: [{ userId: id }, { reportedUserId: id }, { itemId: { $in: listingIds } }] }),
    ChatMessage.deleteMany({ $or: [{ senderId: id }, { receiverId: id }, { itemId: { $in: listingIds } }] }),
    Review.deleteMany({ $or: [{ reviewerId: id }, { sellerId: id }] }),
    BlockedUser.deleteMany({ $or: [{ userId: id }, { blockedUserId: id }] }),
    Media.deleteMany({ uploadedBy: id }),
    PushSubscriber.deleteMany({ userId: id }),
    PushJob.deleteMany({ userId: id }),
    UserPurchasedPackage.deleteMany({ userId: id }),
  ]);
  await User.deleteOne({ _id: id });
  forgetAccount(id);
  if (listingIds.length) markCountsStale();
  return { listings: listingIds.length, media: media.length, messages: (msgs as any)?.deletedCount || 0 };
}

import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import { requireAdmin } from "@/lib/auth";

// GET /api/admin/verifications?status=pending  → verification requests
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  await dbConnect();
  const q: any = {};
  if (status !== "all") q.verificationStatus = status;
  else q.verificationStatus = { $in: ["pending", "verified", "rejected"] };

  const users = await User.find(q)
    .select("name email phoneNumber city verificationStatus verificationLevel verificationDoc createdAt")
    .sort({ "verificationDoc.submittedAt": -1 })
    .limit(200)
    .lean();

  // Sellers give their number on their ads, not here: show the one they use
  // (latest ad), and how many ads they have, next to the CNIC.
  const ids = users.map((u: any) => u._id);
  const ads: any[] = ids.length ? await Listing.aggregate([
    { $match: { userId: { $in: ids } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$userId", phone: { $first: "$contactNumber" }, n: { $sum: 1 }, live: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } } } },
  ]) : [];
  const adOf = new Map(ads.map((a) => [String(a._id), a]));

  // The same CNIC on more than one account is worth a second look.
  const numbers = users.map((u: any) => u.verificationDoc?.cnicNumber).filter(Boolean);
  const dupes: any[] = numbers.length ? await User.aggregate([
    { $match: { "verificationDoc.cnicNumber": { $in: numbers } } },
    { $group: { _id: "$verificationDoc.cnicNumber", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]) : [];
  const dupe = new Set(dupes.map((d) => d._id));

  const data = users.map((u: any) => {
    const a = adOf.get(String(u._id));
    return {
      _id: u._id.toString(),
      name: u.name, email: u.email, phone: u.phoneNumber || a?.phone || null, phoneFromAd: !u.phoneNumber && !!a?.phone, city: u.city || null,
      ads: a ? { total: a.n, live: a.live } : { total: 0, live: 0 },
      status: u.verificationStatus, level: u.verificationLevel,
      doc: u.verificationDoc || null,
      cnicReused: !!u.verificationDoc?.cnicNumber && dupe.has(u.verificationDoc.cnicNumber),
      joined: u.createdAt,
    };
  });
  return NextResponse.json({ success: true, data });
}

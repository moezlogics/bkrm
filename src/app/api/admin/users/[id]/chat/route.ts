import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import ChatMessage from "@/models/ChatMessage";
import Offer from "@/models/Offer";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { logAdmin } from "@/lib/admin-log";

/**
 * GET /api/admin/users/[id]/chat?item=<ad id>&with=<user id> — one
 * conversation, read-only, for checking a scam report or a dispute. Opening
 * it is written to the activity log (who read whose chat, and when), and it
 * never marks anything as read.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const item = req.nextUrl.searchParams.get("item") || "";
  const other = req.nextUrl.searchParams.get("with") || "";
  if (![id, item, other].every((v) => mongoose.isValidObjectId(v))) return NextResponse.json({ success: false, message: "Conversation not found" }, { status: 404 });
  await dbConnect();
  const a = new mongoose.Types.ObjectId(id), b = new mongoose.Types.ObjectId(other), ad = new mongoose.Types.ObjectId(item);

  const [msgs, listing, people] = await Promise.all([
    ChatMessage.find({ itemId: ad, $or: [{ senderId: a, receiverId: b }, { senderId: b, receiverId: a }] })
      .sort({ createdAt: 1 }).limit(500).select("senderId message fileUrl audioUrl offerId isRead createdAt").lean(),
    Listing.findById(ad).select("name slug").lean() as Promise<any>,
    User.find({ _id: { $in: [a, b] } }).select("name").lean(),
  ]);
  const offerIds = (msgs as any[]).map((m) => m.offerId).filter(Boolean);
  const offers: any[] = offerIds.length ? await Offer.find({ _id: { $in: offerIds } }).select("amount status").lean() : [];
  const offerOf = new Map(offers.map((o) => [String(o._id), o]));
  const nameOf = new Map((people as any[]).map((p) => [String(p._id), p.name]));

  await logAdmin(session, {
    action: "chat.view", targetType: "user", targetId: id, targetLabel: nameOf.get(id) || id,
    details: `Read the conversation with ${nameOf.get(other) || "a deleted account"} about “${listing?.name || "a deleted ad"}”`,
  });

  return NextResponse.json({
    success: true,
    data: {
      ad: listing ? { name: listing.name, slug: listing.slug } : null,
      people: { [id]: nameOf.get(id) || "This account", [other]: nameOf.get(other) || "Deleted account" },
      messages: (msgs as any[]).map((m) => {
        const o = m.offerId ? offerOf.get(String(m.offerId)) : null;
        return {
          _id: String(m._id), from: String(m.senderId), text: m.message || "", file: m.fileUrl || null, audio: m.audioUrl || null,
          offer: o ? { amount: o.amount, status: o.status } : null, read: !!m.isRead, at: m.createdAt,
        };
      }),
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

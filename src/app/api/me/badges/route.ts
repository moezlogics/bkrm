import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { getServerSession } from "@/lib/auth";
import UserNotification from "@/models/UserNotification";
import ChatMessage from "@/models/ChatMessage";

/**
 * GET /api/me/badges — the little counts on the bell and the Chat tab.
 * Signed out: zeros (no error, so the header can call it on every page).
 */
export async function GET() {
  const session = await getServerSession();
  if (!session?.userId || !mongoose.isValidObjectId(session.userId)) {
    return NextResponse.json({ notifications: 0, chats: 0 }, { headers: { "Cache-Control": "private, no-store" } });
  }
  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const [notifications, chats] = await Promise.all([
    UserNotification.countDocuments({ userId: uid, readAt: null }),
    ChatMessage.countDocuments({ receiverId: uid, isRead: false }),
  ]);
  return NextResponse.json({ notifications, chats }, { headers: { "Cache-Control": "private, no-store" } });
}

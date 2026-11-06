import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Notification from "@/models/Notification";
import User from "@/models/User";
import { requireAdmin } from "@/lib/auth";
import { pusherServer } from "@/lib/pusher";

// GET → past notifications (history)
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const items = await Notification.find({}).sort({ createdAt: -1 }).limit(50).lean();
    const audience = await User.estimatedDocumentCount();
    return NextResponse.json({ success: true, data: items, audience });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

// POST → compose + broadcast a notification
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    const { title, message, image } = await req.json();
    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message required" }, { status: 400 });
    }
    await dbConnect();

    const notif = await Notification.create({
      title: title.trim(),
      message: message.trim(),
      image: image || null,
      sendTo: "all",
      userIds: [],
    });

    // Realtime broadcast (Pusher). FCM/email can be layered later.
    try {
      await pusherServer.trigger("notifications", "new", {
        _id: notif._id.toString(),
        title: notif.title,
        message: notif.message,
        image: notif.image,
        createdAt: notif.createdAt,
      });
    } catch (e) {
      console.warn("Notification broadcast failed (Pusher unconfigured):", e);
    }

    return NextResponse.json({ success: true, message: "Notification sent", data: notif });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message || "Failed" }, { status: 500 });
  }
}

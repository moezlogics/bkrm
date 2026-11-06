import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ChatMessage from "@/models/ChatMessage";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    await dbConnect();

    // 2. Fetch all messages involving this user, sorted newest first
    const messages = await ChatMessage.find({
      $or: [
        { senderId: session.userId },
        { receiverId: session.userId },
      ],
    })
      .sort({ createdAt: -1 })
      .lean();

    // 3. Group messages into threads by (itemId + otherParticipantId)
    const threadMap = new Map<string, any>();

    for (const msg of messages) {
      // An incomplete row (no ad / sender / receiver) used to throw here and
      // take the whole inbox down with it.
      if (!msg.itemId || !msg.senderId || !msg.receiverId) continue;
      const otherParticipantId =
        msg.senderId.toString() === session.userId
          ? msg.receiverId.toString()
          : msg.senderId.toString();

      const threadKey = `${msg.itemId.toString()}_${otherParticipantId}`;

      if (!threadMap.has(threadKey)) {
        threadMap.set(threadKey, {
          _id: threadKey,
          itemId: msg.itemId.toString(),
          otherParticipantId,
          lastMessage: {
            text: msg.message || (msg.fileUrl ? "Image Attachment" : "Message"),
            createdAt: msg.createdAt,
            senderId: msg.senderId.toString(),
          },
          unreadCount: 0,
        });
      }

      // Count unread messages received by this user
      if (msg.receiverId.toString() === session.userId && !msg.isRead) {
        threadMap.get(threadKey).unreadCount += 1;
      }
    }

    const threadsArray = Array.from(threadMap.values());

    if (threadsArray.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // 4. Batch populate Users and Listings for performance
    const uniqueUserIds = Array.from(new Set(threadsArray.map((t) => t.otherParticipantId)));
    const uniqueItemIds = Array.from(new Set(threadsArray.map((t) => t.itemId)));

    const [users, listings] = await Promise.all([
      User.find({ _id: { $in: uniqueUserIds } }).select("name profileImage").lean(),
      // userId is needed to tell buyer from seller below — it was missing from
      // this select, so every inbox with a message in it failed with
      // "Cannot read properties of undefined (reading 'toString')".
      Listing.find({ _id: { $in: uniqueItemIds } }).select("name price galleryImages mainImage slug userId").lean(),
    ]);

    const userLookup = new Map(users.map((u) => [u._id.toString(), u]));
    const listingLookup = new Map(listings.map((l) => [l._id.toString(), l]));

    // 5. Construct final ChatThread response matching frontend ChatThread interface
    const populatedThreads = threadsArray
      .map((thread) => {
        const otherUser: any = userLookup.get(thread.otherParticipantId);
        const item: any = listingLookup.get(thread.itemId);

        if (!otherUser || !item) return null; // skip orphaned/deleted items or users

        return {
          _id: thread._id,
          buyerId: String(item.userId) === session.userId ? thread.otherParticipantId : session.userId,
          ad: {
            _id: item._id.toString(),
            title: item.name,
            images: item.galleryImages && item.galleryImages.length > 0 ? item.galleryImages : (item.mainImage ? [item.mainImage] : []),
            price: item.price,
            slug: item.slug,
          },
          participants: [
            {
              _id: session.userId,
              name: session.user.name || "Me",
              image: session.user.image || null,
            },
            {
              _id: otherUser._id.toString(),
              name: otherUser.name,
              image: otherUser.profileImage || null,
            },
          ],
          lastMessage: thread.lastMessage,
          unreadCount: thread.unreadCount,
        };
      })
      .filter((t) => t !== null);

    return NextResponse.json({
      success: true,
      data: populatedThreads,
    });
  } catch (error: any) {
    console.error("GET Chat Threads Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch chat threads" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const { adId } = await req.json();

    if (!adId) {
      return NextResponse.json(
        { success: false, message: "Ad ID is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Fetch the listing
    const listing = await Listing.findById(adId)
      .populate({ path: "userId", model: User })
      .lean();

    if (!listing) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }

    const sellerId = listing.userId._id.toString();

    if (sellerId === session.userId) {
      return NextResponse.json(
        { success: false, message: "You cannot initiate a chat on your own listing" },
        { status: 400 }
      );
    }

    // 3. Return a placeholder/initialized thread object
    const threadId = `${adId}_${sellerId}`;

    const otherUser = listing.userId as any;

    const threadObj = {
      _id: threadId,
      ad: {
        _id: listing._id.toString(),
        title: listing.name,
        images: listing.galleryImages && listing.galleryImages.length > 0 ? listing.galleryImages : (listing.mainImage ? [listing.mainImage] : []),
        price: listing.price,
        slug: listing.slug,
      },
      participants: [
        {
          _id: session.userId,
          name: session.user.name || "Me",
          image: session.user.image || null,
        },
        {
          _id: sellerId,
          name: otherUser.name,
          image: otherUser.profileImage || null,
        },
      ],
      lastMessage: {
        text: "Tap to start conversation",
        createdAt: new Date().toISOString(),
        senderId: "",
      },
      unreadCount: 0,
    };

    return NextResponse.json({
      success: true,
      data: threadObj,
    });
  } catch (error: any) {
    console.error("POST Create Chat Thread Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to initialize chat thread" },
      { status: 500 }
    );
  }
}

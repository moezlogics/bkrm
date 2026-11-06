import { NextRequest, NextResponse } from "next/server";
import { onChatMessage } from "@/lib/push/events";
import dbConnect from "@/lib/mongodb";
import ChatMessage from "@/models/ChatMessage";
import Listing from "@/models/Listing";
import Offer from "@/models/Offer";
import User from "@/models/User";
import { requireAuth } from "@/lib/auth";
import { pusherServer as pusher, pushSellerStat } from "@/lib/pusher";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const [adId, otherId] = threadId.split("_");
    if (!adId || !otherId) {
      return NextResponse.json(
        { success: false, message: "Invalid thread ID structure" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Mark incoming unread messages in this thread as read
    await ChatMessage.updateMany(
      {
        itemId: adId,
        senderId: otherId,
        receiverId: session.userId,
        isRead: false,
      },
      { isRead: true }
    );

    // 3. Query all messages for this thread, sorted chronologically
    const messages = await ChatMessage.find({
      itemId: adId,
      $or: [
        { senderId: session.userId, receiverId: otherId },
        { senderId: otherId, receiverId: session.userId },
      ],
    })
      .sort({ createdAt: 1 })
      .populate({ path: "offerId", model: Offer })
      .lean();

    // 4. Map to frontend Message interface
    const mappedMessages = messages.map((msg: any) => {
      let type: "text" | "offer" | "image" = "text";
      if (msg.offerId) {
        type = "offer";
      } else if (msg.fileUrl) {
        type = "image";
      }

      return {
        _id: msg._id.toString(),
        threadId,
        senderId: msg.senderId.toString(),
        text: msg.message || "",
        type,
        offerId: msg.offerId?._id?.toString() || undefined,
        offerAmount: msg.offerId?.amount || undefined,
        offerStatus: msg.offerId?.status || undefined,
        createdAt: msg.createdAt.toISOString(),
      };
    });

    return NextResponse.json({
      success: true,
      data: mappedMessages,
    });
  } catch (error: any) {
    console.error("GET Chat Messages Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  try {
    const { threadId } = await params;
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const [adId, otherId] = threadId.split("_");
    if (!adId || !otherId) {
      return NextResponse.json(
        { success: false, message: "Invalid thread ID structure" },
        { status: 400 }
      );
    }

    const { text, type, offerAmount } = await req.json();

    await dbConnect();

    // 2. Fetch the Listing
    const listing = await Listing.findById(adId).lean();
    if (!listing) {
      return NextResponse.json(
        { success: false, message: "Listing not found" },
        { status: 404 }
      );
    }
    // Demo ads (optional at setup) only show how the site works — nobody answers them.
    if ((listing as { isDemo?: boolean }).isDemo) {
      return NextResponse.json({ success: false, message: "This is a demo ad — it isn't for sale." }, { status: 403 });
    }

    let createdOfferId = null;
    let messageText = text || "";

    // 3. Handle Price Offers
    if (type === "offer" && offerAmount) {
      const sellerId = listing.userId.toString();
      const buyerId = sellerId === session.userId ? otherId : session.userId;

      // Lowball guardrail: reject offers below 75% of the asking price.
      // Only applies when the ad actually has a price (free / contact-for-price ads have none).
      if (typeof listing.price === "number" && listing.price > 0) {
        const minOffer = Math.ceil(listing.price * 0.75);
        if (Number(offerAmount) < minOffer) {
          return NextResponse.json(
            {
              success: false,
              message: `Offer too low. Minimum offer is Rs. ${minOffer.toLocaleString()} (75% of the asking price).`,
            },
            { status: 400 }
          );
        }
      }

      // Create new Offer entry in DB
      const newOffer = await Offer.create({
        buyerId,
        sellerId,
        itemId: adId,
        amount: Number(offerAmount),
        status: "pending",
      });

      createdOfferId = newOffer._id;
      if (!messageText) {
        messageText = `Proposed an offer for Rs. ${Number(offerAmount).toLocaleString()}`;
      }

      // Realtime: notify seller's analytics channel of a new offer
      pushSellerStat(sellerId, { type: "offer", listingId: adId, delta: 1 });
    }

    // 4. Create the ChatMessage document
    const newMessage = await ChatMessage.create({
      senderId: session.userId,
      receiverId: otherId,
      itemId: adId,
      offerId: createdOfferId,
      message: messageText,
      isRead: false,
    });

    // Format message matching the frontend structure
    const formattedMsg = {
      _id: newMessage._id.toString(),
      threadId,
      senderId: session.userId,
      text: messageText,
      type: type || (createdOfferId ? "offer" : "text"),
      offerId: createdOfferId ? createdOfferId.toString() : undefined,
      offerAmount: offerAmount ? Number(offerAmount) : undefined,
      createdAt: newMessage.createdAt.toISOString(),
    };

    // 5. Trigger Pusher Real-time Event
    // Find the buyer ID (buyer is whoever is NOT the listing owner)
    const listingOwner = listing.userId.toString();
    const buyerId = listingOwner === session.userId ? otherId : session.userId;
    // Canonical channel — must match client subscription (chat/page.tsx)
    // and offer route: `chat-${adId}-${buyerId}` (NO "private-" prefix).
    const pusherChannel = `chat-${adId}-${buyerId}`;

    try {
      await pusher.trigger(pusherChannel, "new-message", formattedMsg);
    } catch (pushErr) {
      console.warn("Pusher trigger failed (Pusher might not be configured yet):", pushErr);
    }

    // Web push to the other person (their phone may be locked / tab closed).
    onChatMessage({
      listing: listing as any,
      senderId: session.userId,
      receiverId: otherId,
      text: messageText,
      offerAmount: createdOfferId ? Number(offerAmount) : null,
    });

    return NextResponse.json({
      success: true,
      data: formattedMsg,
    });
  } catch (error: any) {
    console.error("POST Chat Message Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to send message" },
      { status: 500 }
    );
  }
}

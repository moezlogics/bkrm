import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Offer from "@/models/Offer";
import ChatMessage from "@/models/ChatMessage";
import { requireAuth } from "@/lib/auth";
// Use the shared singleton rather than a second client with its own (and
// differently-spelled) env vars.
import { pusherTrigger } from "@/lib/pusher";
import { onOfferDecision } from "@/lib/push/events";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 1. Authenticate user
    const { session, error } = await requireAuth();
    if (error) return error;

    const { status } = await req.json();

    if (status !== "accepted" && status !== "rejected") {
      return NextResponse.json(
        { success: false, message: "Invalid status (must be accepted or rejected)" },
        { status: 400 }
      );
    }

    await dbConnect();

    // 2. Fetch the offer
    const offer = await Offer.findById(id);
    if (!offer) {
      return NextResponse.json(
        { success: false, message: "Offer not found" },
        { status: 404 }
      );
    }

    // 3. Authorization: Only the listing seller can accept/reject the offer
    if (offer.sellerId.toString() !== session.userId) {
      return NextResponse.json(
        { success: false, message: "You are not authorized to update this offer" },
        { status: 403 }
      );
    }

    // 4. Update status
    offer.status = status;
    await offer.save();

    // 5. Send a system chat message informing the buyer of the decision
    const systemMessageText = `Offer was ${status.toUpperCase()} by the seller.`;
    const newMsg = await ChatMessage.create({
      senderId: session.userId,
      receiverId: offer.buyerId,
      itemId: offer.itemId,
      message: systemMessageText,
    });

    // 6. Trigger Pusher Real-time update
    const threadId = `${offer.itemId.toString()}_${offer.buyerId.toString()}`;
    const pusherChannel = `chat-${offer.itemId.toString()}-${offer.buyerId.toString()}`;

    const formattedMsg = {
      _id: newMsg._id.toString(),
      threadId,
      senderId: session.userId,
      text: systemMessageText,
      type: "text",
      createdAt: newMsg.createdAt.toISOString(),
    };

    await pusherTrigger(pusherChannel, "new-message", formattedMsg);
    await pusherTrigger(pusherChannel, "offer-updated", { offerId: id, status });
    onOfferDecision({ buyerId: offer.buyerId, sellerId: offer.sellerId, itemId: offer.itemId, amount: offer.amount, accepted: status === "accepted" });

    return NextResponse.json({
      success: true,
      message: `Offer ${status} successfully.`,
      data: offer,
    });
  } catch (error: any) {
    console.error("PUT Offer Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to update offer" },
      { status: 500 }
    );
  }
}

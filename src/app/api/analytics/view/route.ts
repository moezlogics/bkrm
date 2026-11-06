import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { countView } from "@/lib/counters";

/**
 * Detail-page view counter (public, session-deduped client-side).
 * Counted in memory and written in bulk every few seconds (lib/counters),
 * which also pushes the seller's live dashboard update.
 */
export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (id && mongoose.Types.ObjectId.isValid(id)) countView(String(id));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 200 });
  }
}

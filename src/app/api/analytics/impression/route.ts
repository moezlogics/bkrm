import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { countImpressions } from "@/lib/counters";

/**
 * Batched impression counter (public, session-deduped client-side).
 * Counted in memory and written in bulk every few seconds (lib/counters).
 */
export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json();
    if (!Array.isArray(ids) || !ids.length) return NextResponse.json({ success: true, counted: 0 });
    const valid = [...new Set(ids.map(String))].filter((x) => mongoose.Types.ObjectId.isValid(x)).slice(0, 60);
    if (valid.length) countImpressions(valid);
    return NextResponse.json({ success: true, counted: valid.length });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 200 });
  }
}

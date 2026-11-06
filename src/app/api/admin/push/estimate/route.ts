import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { cleanAudience } from "@/lib/push/campaign-input";
import { estimateAudience } from "@/lib/push/campaigns";

/** POST /api/admin/push/estimate { audience } — how many devices it reaches. */
export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  const count = await estimateAudience(cleanAudience(b?.audience)).catch(() => -1);
  return NextResponse.json({ success: count >= 0, count });
}

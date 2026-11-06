import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { bumpStat, bumpCampaign, bumpSubscriberClick, type StatField } from "@/lib/push/stats";
import { TtlLru } from "@/lib/memo";

/**
 * POST /api/push/track { e: "delivered" | "click" | "close", id, t, c?, endpoint? }
 * Sent by the service worker when a notification is shown, tapped or
 * dismissed — this is where delivery rate and CTR come from. Counted in
 * memory and written in batches; each device's event is counted once.
 */
const FIELD: Record<string, StatField> = { delivered: "delivered", click: "clicked", close: "closed" };
const seen = new TtlLru<true>(200_000, 24 * 3_600_000);

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => null);
  const field = FIELD[b?.e];
  const id = typeof b?.id === "string" ? b.id.slice(0, 40) : "";
  if (!field || !id) return NextResponse.json({ ok: false }, { status: 400 });

  const who = typeof b?.endpoint === "string" ? b.endpoint.slice(-64) : (req.headers.get("x-forwarded-for") || "local");
  const key = `${who}|${id}|${field}`;
  if (seen.get(key)) return NextResponse.json({ ok: true });
  seen.set(key, true);

  const type = typeof b?.t === "string" && /^[a-z_]{2,30}$/.test(b.t) ? b.t : "campaign";
  bumpStat(type, { [field]: 1 });
  if (typeof b?.c === "string" && mongoose.isValidObjectId(b.c)) bumpCampaign(b.c, { [field]: 1 });
  if (field === "clicked" && typeof b?.endpoint === "string" && b.endpoint.length < 1024) bumpSubscriberClick(b.endpoint);
  return NextResponse.json({ ok: true });
}

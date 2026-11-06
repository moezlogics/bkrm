import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { countContact, type ContactKind } from "@/lib/counters";

/**
 * A tap on Call, WhatsApp or Live Chat on an ad (public). The browser counts
 * each ad and kind once per session (lib/track); this only stops one address
 * looping on the same ad, well above anything a person does. It is per
 * process and in memory, which is enough for a ceiling against scripts.
 */
const KINDS = new Set<ContactKind>(["call", "whatsapp", "chat"]);
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 6;
const g = globalThis as unknown as { __contactSeen?: Map<string, { n: number; at: number }> };
const seen = (g.__contactSeen ??= new Map());

function flooding(key: string): boolean {
  const now = Date.now();
  const hit = seen.get(key);
  if (!hit || now - hit.at > WINDOW_MS) {
    if (seen.size > 50_000) seen.clear();
    seen.set(key, { n: 1, at: now });
    return false;
  }
  hit.n += 1;
  return hit.n > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  try {
    const { id, kind } = await req.json();
    if (!id || !mongoose.Types.ObjectId.isValid(id) || !KINDS.has(kind)) return NextResponse.json({ success: false }, { status: 200 });
    const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "").trim();
    if (!flooding(`${ip}|${id}|${kind}`)) countContact(String(id), kind);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false }, { status: 200 });
  }
}

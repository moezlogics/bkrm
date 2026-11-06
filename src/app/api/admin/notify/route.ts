import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";
import { requireAdmin } from "@/lib/auth";
import { NOTIFY_CATEGORIES, notifyDiscord, resetDiscordConfig, DISCORD_COLORS } from "@/lib/discord";
import { logAdmin } from "@/lib/admin-log";

/**
 * Settings → Notifications (the admin's Discord channel).
 *
 * GET   which alerts are on, and whether a channel is connected
 * PUT   { off: [category ids], webhook? }   save the switches (and the channel, unless the server's env sets it)
 * POST  { kind: "test" | "digest" }          send a test alert, or this morning's report now
 */
async function state() {
  await dbConnect();
  const docs: any[] = await Setting.find({ key: { $in: ["notify_off", "discord_webhook_url"] } }).lean();
  const by = new Map(docs.map((d) => [d.key, String(d.value ?? "")]));
  let off: string[] = [];
  try { off = JSON.parse(by.get("notify_off") || "[]"); } catch { /* none */ }
  const fromEnv = !!process.env.DISCORD_WEBHOOK_URL?.startsWith("http");
  const saved = by.get("discord_webhook_url") || "";
  return {
    fromEnv,
    connected: fromEnv || saved.startsWith("http"),
    // Never send the URL back: it is a write key to the channel.
    webhookSaved: saved.startsWith("http"),
    categories: Object.entries(NOTIFY_CATEGORIES).map(([id, c]) => ({ id, label: c.label, hint: c.hint, on: !off.includes(id) })),
  };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ success: true, data: await state() }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PUT(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const valid = new Set(Object.keys(NOTIFY_CATEGORIES));
  const off = (Array.isArray(body?.off) ? body.off : []).map(String).filter((k: string) => valid.has(k));
  await dbConnect();
  await Setting.updateOne({ key: "notify_off" }, { $set: { value: JSON.stringify(off) } }, { upsert: true });
  const changed: string[] = ["alert switches"];
  if (typeof body?.webhook === "string" && !process.env.DISCORD_WEBHOOK_URL) {
    const url = body.webhook.trim();
    if (url && !/^https:\/\/(discord(app)?\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
      return NextResponse.json({ success: false, message: "That doesn't look like a Discord webhook link (https://discord.com/api/webhooks/…)." }, { status: 400 });
    }
    await Setting.updateOne({ key: "discord_webhook_url" }, { $set: { value: url } }, { upsert: true });
    changed.push(url ? "Discord channel" : "Discord channel removed");
  }
  resetDiscordConfig();
  await logAdmin(session, { action: "settings.update", targetType: "settings", targetLabel: "Notifications", details: `${changed.join(", ")}${off.length ? ` — off: ${off.join(", ")}` : ""}` });
  return NextResponse.json({ success: true, message: "Notification settings saved.", data: await state() });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const { kind } = await req.json().catch(() => ({}));
  const s = await state();
  if (!s.connected) return NextResponse.json({ success: false, message: "No Discord channel is connected yet." }, { status: 400 });
  resetDiscordConfig();
  if (kind === "digest") {
    const { sendDigest } = await import("@/lib/admin-digest");
    await sendDigest();
    return NextResponse.json({ success: true, message: "Report sent — check your Discord channel." });
  }
  await notifyDiscord({
    title: "🔔 Test alert",
    description: `Alerts from the admin panel reach this channel. Sent by ${session.user?.email || "an admin"}.`,
    url: "/admin/settings?tab=notifications",
    color: DISCORD_COLORS.approved,
  });
  return NextResponse.json({ success: true, message: "Test alert sent — check your Discord channel." });
}

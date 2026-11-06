import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PushSubscriber from "@/models/PushSubscriber";
import PushStat from "@/models/PushStat";
import PushCampaign from "@/models/PushCampaign";
import { requireAdmin } from "@/lib/auth";
import { getPushConfig, dayKey } from "@/lib/push/config";
import { vapidPublicKey } from "@/lib/push/send";
import { TtlLru } from "@/lib/memo";

/**
 * GET /api/admin/push/overview — the push dashboard: subscribers (totals,
 * growth, where they are, what they use) and what was sent / delivered /
 * tapped over the last 30 days. Shared for 20 s so a busy admin team
 * doesn't re-run the aggregations on every refresh.
 */
const cache = new TtlLru<any>(1, 20_000);
const DAYS = 30;

async function build() {
  await dbConnect();
  const tz = (await getPushConfig()).timezone;
  const since = (n: number) => new Date(Date.now() - n * 86_400_000);
  const active = { status: "active" as const };
  const top = (field: string, limit = 12) => PushSubscriber.aggregate([
    { $match: active },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: limit },
  ]).option({ maxTimeMS: 15_000 });
  const perDay = (field: "createdAt" | "endedAt") => PushSubscriber.aggregate([
    { $match: { [field]: { $gte: since(DAYS) } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${field}`, timezone: tz } }, n: { $sum: 1 } } },
  ]).option({ maxTimeMS: 15_000 });

  const [total, users, sellers, new1, new7, new30, lost30, byCity, byState, byBrowser, byOS, byDevice, joined, left, stats, campaigns] = await Promise.all([
    PushSubscriber.countDocuments(active),
    PushSubscriber.countDocuments({ ...active, userId: { $ne: null } }),
    PushSubscriber.countDocuments({ ...active, userId: { $ne: null }, isSeller: true }),
    PushSubscriber.countDocuments({ createdAt: { $gte: since(1) } }),
    PushSubscriber.countDocuments({ createdAt: { $gte: since(7) } }),
    PushSubscriber.countDocuments({ createdAt: { $gte: since(30) } }),
    PushSubscriber.countDocuments({ endedAt: { $gte: since(30) } }),
    top("city", 15), top("state", 12), top("browser"), top("os"), top("device"),
    perDay("createdAt"), perDay("endedAt"),
    PushStat.find({ day: { $gte: dayKey(tz, since(DAYS - 1)) } }).lean(),
    PushCampaign.find().sort({ createdAt: -1 }).limit(5).select("name title status stats sendAt finishedAt createdAt").lean(),
  ]);

  // Day-by-day series for the last 30 days (days with nothing still appear).
  const days: string[] = [];
  for (let i = DAYS - 1; i >= 0; i--) days.push(dayKey(tz, since(i)));
  const map = (rows: any[]) => new Map(rows.map((r) => [r._id, r.n]));
  const j = map(joined), l = map(left);
  const sums = new Map<string, { sent: number; delivered: number; clicked: number }>();
  const byType = new Map<string, { sent: number; failed: number; delivered: number; clicked: number; closed: number }>();
  for (const s of stats as any[]) {
    if (s.type === "subscriber") continue;
    const d = sums.get(s.day) || { sent: 0, delivered: 0, clicked: 0 };
    d.sent += s.sent || 0; d.delivered += s.delivered || 0; d.clicked += s.clicked || 0;
    sums.set(s.day, d);
    const t = byType.get(s.type) || { sent: 0, failed: 0, delivered: 0, clicked: 0, closed: 0 };
    for (const k of ["sent", "failed", "delivered", "clicked", "closed"] as const) t[k] += s[k] || 0;
    byType.set(s.type, t);
  }
  const named = (rows: any[]) => rows.map((r) => ({ name: r._id || "Unknown", n: r.n }));

  return {
    vapid: !!vapidPublicKey(),
    totals: { active: total, users, guests: total - users, sellers, buyers: users - sellers, new1, new7, new30, lost30 },
    growth: days.map((d) => ({ day: d, joined: j.get(d) || 0, left: l.get(d) || 0 })),
    sends: days.map((d) => ({ day: d, ...(sums.get(d) || { sent: 0, delivered: 0, clicked: 0 }) })),
    byType: Array.from(byType, ([type, v]) => ({ type, ...v })).sort((a, b) => b.sent - a.sent),
    byCity: named(byCity), byState: named(byState), byBrowser: named(byBrowser), byOS: named(byOS), byDevice: named(byDevice),
    campaigns,
  };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json({ success: true, data: await cache.memo("o", build) });
}

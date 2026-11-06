/**
 * Day-by-day numbers for the admin dashboard and Insights (Pakistan time).
 *
 * New ads and accounts come from their creation dates; views, impressions and
 * leads from the `daily_stats` rows that lib/counters adds to on every flush
 * (they start on the day this was first deployed — earlier days read 0).
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import Listing from "@/models/Listing";
import User from "@/models/User";
import { statDay } from "@/lib/counters";

const TZ = "Asia/Karachi";

export interface DailySeries {
  days: string[];
  ads: number[];
  users: number[];
  views: number[];
  impressions: number[];
  calls: number[];
  whatsapp: number[];
  chats: number[];
  leads: number[];
}

export function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(statDay(new Date(Date.now() - i * 864e5)));
  return out;
}

export async function dailySeries(n = 30): Promise<DailySeries> {
  await dbConnect();
  const days = lastDays(n);
  const since = new Date(`${days[0]}T00:00:00+05:00`);
  const perDay = (model: mongoose.Model<any>) =>
    model.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } }, n: { $sum: 1 } } },
    ]).option({ maxTimeMS: 10_000 }).catch(() => []);
  const [ads, users, stats] = await Promise.all([
    perDay(Listing),
    perDay(User),
    mongoose.connection.db!.collection<{ _id: string }>("daily_stats").find({ _id: { $in: days } }).toArray().catch(() => []),
  ]);
  const by = (rows: any[]) => new Map(rows.map((r) => [String(r._id), r.n as number]));
  const a = by(ads), u = by(users);
  const s = new Map((stats as any[]).map((r) => [String(r._id), r]));
  const col = (k: string) => days.map((d) => Number(s.get(d)?.[k] || 0));
  const calls = col("phoneClicks"), whatsapp = col("whatsappClicks"), chats = col("chatClicks");
  return {
    days,
    ads: days.map((d) => a.get(d) || 0),
    users: days.map((d) => u.get(d) || 0),
    views: col("clicks"),
    impressions: col("impressions"),
    calls, whatsapp, chats,
    leads: days.map((_, i) => calls[i] + whatsapp[i] + chats[i]),
  };
}

export const points = (s: DailySeries, k: keyof Omit<DailySeries, "days">) => s.days.map((day, i) => ({ day, value: s[k][i] }));

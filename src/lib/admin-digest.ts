/**
 * The morning report, in the admin's Discord channel at 9:00 Pakistan time:
 * what happened in the last 24 hours (accounts, ads, sales, leads, money),
 * what is waiting for the admin (ads to review, payments, verifications,
 * reports) and what runs out soon (plans this week, ads in the next 3 days).
 *
 * Sent once a day however many processes run it: the day is claimed in the
 * database first. Switch it off in Settings → Notifications ("Daily report").
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Listing from "@/models/Listing";
import Invoice from "@/models/Invoice";
import UserReport from "@/models/UserReport";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import { notifyDiscord, discordConfigured, DISCORD_COLORS } from "@/lib/discord";
import { statDay } from "@/lib/counters";

const HOUR_PKT = 9;
const n = (v: number) => v.toLocaleString("en-PK");

export async function maybeSendDigest(): Promise<boolean> {
  if (!(await discordConfigured())) return false;
  const pktHour = new Date(Date.now() + 5 * 3_600_000).getUTCHours();
  if (pktHour < HOUR_PKT) return false;
  const { once } = await import("@/lib/push/once");
  if (!(await once(`digest:${statDay()}`, 36))) return false;
  await sendDigest();
  return true;
}

export async function sendDigest(): Promise<void> {
  await dbConnect();
  const now = Date.now();
  const since = new Date(now - 24 * 3_600_000);
  const week = new Date(now + 7 * 864e5);
  const soon = new Date(now + 3 * 864e5);
  const c = (p: Promise<number>) => p.catch(() => 0);
  const yesterday = statDay(new Date(now - 864e5));

  const [users, adsNew, adsLive, sold, review, verifications, payments, reports, plansEnding, adsEnding, money, day] = await Promise.all([
    c(User.countDocuments({ createdAt: { $gte: since } }).exec()),
    c(Listing.countDocuments({ createdAt: { $gte: since } }).exec()),
    c(Listing.countDocuments({ status: "approved" }).exec()),
    c(Listing.countDocuments({ soldAt: { $gte: since } }).exec()),
    c(Listing.countDocuments({ status: "review" }).exec()),
    c(User.countDocuments({ verificationStatus: "pending" }).exec()),
    c(Invoice.countDocuments({ status: "submitted" }).exec()),
    c(UserReport.countDocuments({ status: "open" }).exec()),
    c(UserPurchasedPackage.countDocuments({ status: "active", endDate: { $gt: new Date(now), $lte: week } }).exec()),
    c(Listing.countDocuments({ status: "approved", expiresAt: { $gt: new Date(now), $lte: soon } }).exec()),
    Invoice.aggregate([{ $match: { status: "approved", reviewedAt: { $gte: since } } }, { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } }]).catch(() => []),
    mongoose.connection.db!.collection<{ _id: string }>("daily_stats").findOne({ _id: yesterday }).catch(() => null) as Promise<any>,
  ]);
  const paid = money[0] || { total: 0, count: 0 };
  const leads = (day?.phoneClicks || 0) + (day?.whatsappClicks || 0) + (day?.chatClicks || 0);
  const waiting = review + verifications + payments + reports;

  await notifyDiscord({
    title: `📊 Daily report — ${new Date(now + 5 * 3_600_000).toISOString().slice(0, 10)}`,
    description: waiting ? `**${n(waiting)}** thing${waiting === 1 ? "" : "s"} waiting for you.` : "Nothing is waiting for you. 🎉",
    url: "/admin",
    color: DISCORD_COLORS.info,
    category: "digest",
    fields: [
      { name: "🆕 New accounts (24h)", value: n(users), inline: true },
      { name: "📝 New ads (24h)", value: n(adsNew), inline: true },
      { name: "🤝 Marked sold (24h)", value: n(sold), inline: true },
      { name: "💰 Payments approved (24h)", value: `${n(paid.count)} · Rs ${n(paid.total)}`, inline: true },
      { name: "👀 Ad views (yesterday)", value: n(day?.clicks || 0), inline: true },
      { name: "📞 Leads (yesterday)", value: `${n(leads)} (call ${n(day?.phoneClicks || 0)} · WhatsApp ${n(day?.whatsappClicks || 0)} · chat ${n(day?.chatClicks || 0)})`, inline: false },
      { name: "⏳ Ads to review", value: n(review), inline: true },
      { name: "💳 Payments to verify", value: n(payments), inline: true },
      { name: "🪪 ID verifications", value: n(verifications), inline: true },
      { name: "🚩 Open reports", value: n(reports), inline: true },
      { name: "📅 Plans ending this week", value: n(plansEnding), inline: true },
      { name: "⌛ Ads expiring in 3 days", value: n(adsEnding), inline: true },
      { name: "✅ Live ads now", value: n(adsLive), inline: true },
    ],
  });
}

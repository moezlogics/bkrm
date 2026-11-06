import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import User from "@/models/User";
import Listing from "@/models/Listing";
import Package from "@/models/Package";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import { forgetAccount } from "@/lib/account-state";
import { logAdmin } from "@/lib/admin-log";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { activatePlan, endActivePlan } from "@/lib/plan";
import { onPlanDecision } from "@/lib/push/events";
import { sendPlanResultEmail } from "@/lib/email";
import { hideSellerAds, restoreSellerAds, deleteAccount } from "@/lib/user-admin";

/**
 * Admin → Users.
 *
 * GET    ?search=&role=&status=&verified=&type=&plan=&sort=&page=&limit=  (format=csv to download)
 * PATCH  { userId, action, ...options }     block / unblock / admin rights / verification / sign out / note / plans
 * DELETE { userId, confirm: <their email> } delete the account and everything it owns
 */

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const oid = (id: string) => new mongoose.Types.ObjectId(id);

async function payingUserIds(): Promise<mongoose.Types.ObjectId[]> {
  return UserPurchasedPackage.distinct("userId", { status: "active", endDate: { $gt: new Date() } });
}

async function buildQuery(sp: URLSearchParams) {
  const q: any = {};
  const search = (sp.get("search") || "").trim();
  if (search) {
    const safe = esc(search);
    if (mongoose.isValidObjectId(search)) q._id = oid(search);
    else if (search.includes("@")) q.email = new RegExp(`^${esc(search.toLowerCase())}`); // emails are stored lowercase: walks the unique index
    else if (/^[+\d][\d\s-]{3,}$/.test(search)) q.phoneNumber = new RegExp(search.replace(/\D/g, "").slice(-10));
    else q.$or = [{ name: new RegExp(safe, "i") }, { shopName: new RegExp(safe, "i") }, { email: new RegExp(`^${esc(search.toLowerCase())}`) }];
  }
  const role = sp.get("role");
  if (role === "user" || role === "admin") q.role = role;
  const status = sp.get("status");
  if (status === "blocked") q.isBlocked = true;
  else if (status === "active") q.isBlocked = { $ne: true };
  const verified = sp.get("verified");
  if (verified === "id") q.verificationLevel = { $gte: 2 };
  else if (verified === "phone") q.verificationLevel = 1;
  else if (verified === "none") q.verificationLevel = { $in: [0, null] };
  else if (verified === "pending") q.verificationStatus = "pending";
  const type = sp.get("type");
  if (type === "shop") q.isShop = true;
  else if (type === "individual") q.isShop = { $ne: true };
  else if (type === "seller") q.isSeller = true;
  if (sp.get("joined") === "week") q.createdAt = { $gte: new Date(Date.now() - 7 * 864e5) };
  const plan = sp.get("plan");
  if (plan === "paid" || plan === "free") {
    const ids = await payingUserIds();
    (q.$and ||= []).push({ _id: plan === "paid" ? { $in: ids } : { $nin: ids } });
  }
  return q;
}

const SORTS: Record<string, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name: { name: 1 },
  login: { lastLoginAt: -1 },
};

const FIELDS =
  "name email phoneNumber profileImage city state role isBlocked blockReason verificationLevel verificationStatus isPhoneVerified isCnicVerified emailVerified provider rating ratingCount isShop shopName shopSlug isSeller createdAt lastLoginAt";

/** Ads (all / live) and the active plan for one page of users. */
async function enrich(users: any[]) {
  const ids = users.map((u) => u._id);
  const [counts, subs] = await Promise.all([
    Listing.aggregate([
      { $match: { userId: { $in: ids } } },
      { $group: { _id: "$userId", total: { $sum: 1 }, live: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } } } },
    ]).option({ maxTimeMS: 8000 }),
    UserPurchasedPackage.find({ userId: { $in: ids }, status: "active", endDate: { $gt: new Date() } }).select("userId planName endDate").lean(),
  ]);
  const byUser = new Map(counts.map((c: any) => [String(c._id), c]));
  const planBy = new Map((subs as any[]).map((s) => [String(s.userId), { name: s.planName, endDate: s.endDate }]));
  return users.map((u) => ({
    ...u,
    listingCount: byUser.get(String(u._id))?.total || 0,
    liveCount: byUser.get(String(u._id))?.live || 0,
    plan: planBy.get(String(u._id)) || null,
  }));
}

function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Spreadsheet formula injection: a cell starting like a formula is kept as text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;
    await dbConnect();
    const sp = new URL(req.url).searchParams;
    const query = await buildQuery(sp);
    const sort = SORTS[sp.get("sort") || "newest"] || SORTS.newest;

    if (sp.get("format") === "csv") {
      const rows = await enrich(await User.find(query).select(FIELDS).sort(sort).limit(20_000).maxTimeMS(20_000).lean());
      const head = ["Name", "Email", "Phone", "City", "Role", "Status", "Verification", "Shop", "Plan", "Plan ends", "Ads", "Live ads", "Joined", "Last sign-in"];
      const date = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : "");
      const lines = rows.map((u: any) => [
        u.name, u.email, u.phoneNumber, [u.city, u.state].filter(Boolean).join(", "), u.role, u.isBlocked ? "Blocked" : "Active",
        u.verificationLevel >= 2 ? "ID verified" : u.verificationLevel >= 1 ? "Phone verified" : "None", u.isShop ? u.shopName || "Yes" : "",
        u.plan?.name || "Free", date(u.plan?.endDate), u.listingCount, u.liveCount, date(u.createdAt), date(u.lastLoginAt),
      ].map(csvCell).join(","));
      const body = "﻿" + [head.join(","), ...lines].join("\r\n");
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="users-${new Date().toISOString().slice(0, 10)}.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const limit = Math.min(100, Math.max(5, Number(sp.get("limit")) || 25));
    const page = Math.max(1, Number(sp.get("page")) || 1);
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const c = (p: Promise<number>) => p.catch(() => 0);

    const [total, users, all, admins, blocked, verified, shops, newWeek, pending, paid] = await Promise.all([
      User.countDocuments(query).maxTimeMS(8000),
      User.find(query).select(FIELDS).sort(sort).skip((page - 1) * limit).limit(limit).maxTimeMS(8000).lean(),
      c(User.estimatedDocumentCount().exec()),
      c(User.countDocuments({ role: "admin" }).exec()),
      c(User.countDocuments({ isBlocked: true }).exec()),
      c(User.countDocuments({ verificationLevel: { $gte: 2 } }).exec()),
      c(User.countDocuments({ isShop: true }).exec()),
      c(User.countDocuments({ createdAt: { $gte: weekAgo } }).exec()),
      c(User.countDocuments({ verificationStatus: "pending" }).exec()),
      payingUserIds().then((ids) => ids.length).catch(() => 0),
    ]);

    return NextResponse.json({
      success: true,
      data: await enrich(users),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      counts: { all, admins, blocked, verified, shops, newWeek, pending, paid },
    });
  } catch (error: any) {
    console.error("GET Admin Users Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to fetch users" }, { status: 500 });
  }
}

const ACTIONS = ["block", "unblock", "makeAdmin", "makeUser", "verifyId", "unverifyId", "signOut", "note", "grantPlan", "endPlan"] as const;
type Action = (typeof ACTIONS)[number];
const SELF_FORBIDDEN: Action[] = ["block", "makeUser", "signOut"];

export async function PATCH(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "");
    const action = String(body?.action || "") as Action;
    if (!mongoose.isValidObjectId(userId)) return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
    if (!ACTIONS.includes(action)) return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    if (userId === session.userId && SELF_FORBIDDEN.includes(action)) {
      return NextResponse.json({ success: false, message: "You can't do this to your own account." }, { status: 400 });
    }

    await dbConnect();
    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    const label = `${user.name} (${user.email})`;
    const log = (details?: string) => logAdmin(session, { action: `user.${action}`, targetType: "user", targetId: user._id, targetLabel: label, details });
    const alert = (title: string, description: string) =>
      notifyDiscord({ title, description, url: `/admin/users?q=${encodeURIComponent(user.email)}`, color: DISCORD_COLORS.security, category: "admin", fields: [{ name: "By", value: session.user?.email || "admin" }] });
    let message = "User updated";

    switch (action) {
      case "block": {
        if (user.role === "admin") return NextResponse.json({ success: false, message: "Remove their admin rights first." }, { status: 400 });
        const reason = String(body?.reason || "").trim().slice(0, 500);
        user.isBlocked = true;
        user.blockReason = reason || null;
        user.blockedAt = new Date();
        await user.save();
        const hidden = body?.hideAds === false ? 0 : await hideSellerAds(user._id);
        message = hidden ? `Blocked, and ${hidden} live ad${hidden === 1 ? "" : "s"} hidden.` : "Blocked. They are signed out and can't sign in.";
        await log(`${reason || "No reason given"}${hidden ? ` — ${hidden} live ads hidden` : ""}`);
        alert("🚫 Account blocked", `**${label}**\n${reason || "No reason given"}${hidden ? `\n${hidden} live ads hidden` : ""}`);
        break;
      }
      case "unblock": {
        user.isBlocked = false;
        user.blockReason = null;
        user.blockedAt = null;
        await user.save();
        const restored = body?.restoreAds === false ? 0 : await restoreSellerAds(user._id);
        message = restored ? `Unblocked, and ${restored} ad${restored === 1 ? "" : "s"} put back live.` : "Unblocked.";
        await log(restored ? `${restored} ads put back live` : undefined);
        alert("✅ Account unblocked", `**${label}**${restored ? `\n${restored} ads put back live` : ""}`);
        break;
      }
      case "makeAdmin":
        if (user.isBlocked) return NextResponse.json({ success: false, message: "Unblock the account first." }, { status: 400 });
        user.role = "admin";
        await user.save();
        message = `${user.name} is now an admin.`;
        await log();
        alert("👑 New admin", `**${label}** was given admin rights.`);
        break;
      case "makeUser":
        user.role = "user";
        await user.save();
        message = `${user.name}'s admin rights were removed.`;
        await log();
        alert("🛡️ Admin rights removed", `**${label}** is no longer an admin.`);
        break;
      case "verifyId":
        user.isCnicVerified = true;
        user.verificationStatus = "verified";
        user.verificationLevel = Math.max(2, user.verificationLevel || 0) as 0 | 1 | 2 | 3;
        await user.save();
        message = "ID marked as verified.";
        await log();
        break;
      case "unverifyId":
        user.isCnicVerified = false;
        user.verificationStatus = "unverified";
        user.verificationLevel = Math.min(user.verificationLevel || 0, user.isPhoneVerified ? 1 : 0) as 0 | 1 | 2 | 3;
        await user.save();
        message = "ID verification removed.";
        await log();
        break;
      case "signOut":
        user.sessionsRevokedAt = new Date();
        await user.save();
        message = "Signed out on every device.";
        await log();
        break;
      case "note":
        user.adminNote = String(body?.note || "").trim().slice(0, 2000) || null;
        await user.save();
        message = "Note saved.";
        await log(user.adminNote ? "Note updated" : "Note cleared");
        break;
      case "grantPlan": {
        const pkg: any = mongoose.isValidObjectId(String(body?.packageId || "")) ? await Package.findById(body.packageId).lean() : null;
        if (!pkg) return NextResponse.json({ success: false, message: "Choose a plan." }, { status: 400 });
        const days = Number(body?.days) > 0 ? Number(body.days) : pkg.durationDays;
        const sub = await activatePlan({
          userId: user._id, packageId: pkg._id, planName: pkg.name, days,
          snap: { listingLimit: pkg.listingLimit, featuredLimit: pkg.featuredLimit, featuredDurationDays: pkg.featuredDurationDays, durationDays: pkg.durationDays },
        });
        const till = sub.endDate.toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" });
        message = `${pkg.name} given — active until ${till}.`;
        await log(`${pkg.name} for ${Math.round(days)} days (no payment recorded)`);
        alert("🎁 Plan given", `**${label}** — ${pkg.name} until ${till} (no payment recorded)`);
        onPlanDecision({ userId: user._id, approved: true, planName: pkg.name, sub });
        sendPlanResultEmail(user.email, { name: user.name, approved: true, planName: pkg.name, sub });
        break;
      }
      case "endPlan": {
        const ended = await endActivePlan(user._id);
        message = ended ? "Plan ended — they are on the free allowance now." : "They had no active plan.";
        if (ended) await log();
        break;
      }
    }

    forgetAccount(user._id);
    return NextResponse.json({
      success: true,
      message,
      data: { _id: user._id, role: user.role, isBlocked: user.isBlocked, isCnicVerified: user.isCnicVerified, verificationLevel: user.verificationLevel, adminNote: user.adminNote },
    });
  } catch (error: any) {
    console.error("PATCH Admin Users Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;
    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId || "");
    if (!mongoose.isValidObjectId(userId)) return NextResponse.json({ success: false, message: "userId is required" }, { status: 400 });
    if (userId === session.userId) return NextResponse.json({ success: false, message: "You can't delete your own account." }, { status: 400 });
    await dbConnect();
    const user: any = await User.findById(userId).select("name email role").lean();
    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    if (user.role === "admin") return NextResponse.json({ success: false, message: "Remove their admin rights first." }, { status: 400 });
    if (String(body?.confirm || "").trim().toLowerCase() !== user.email) {
      return NextResponse.json({ success: false, message: "Type the account's email to confirm." }, { status: 400 });
    }
    const done = await deleteAccount(user._id);
    const label = `${user.name} (${user.email})`;
    await logAdmin(session, { action: "user.delete", targetType: "user", targetId: user._id, targetLabel: label, details: `${done.listings} ads and ${done.media} files deleted` });
    notifyDiscord({ title: "🗑️ Account deleted", description: `**${label}** — ${done.listings} ads and ${done.media} files removed`, color: DISCORD_COLORS.security, category: "admin", fields: [{ name: "By", value: session.user?.email || "admin" }] });
    return NextResponse.json({ success: true, message: `Deleted ${user.name}'s account (${done.listings} ads).`, data: done });
  } catch (error: any) {
    console.error("DELETE Admin Users Error:", error);
    return NextResponse.json({ success: false, message: error.message || "Failed to delete user" }, { status: 500 });
  }
}

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import mongoose from "mongoose";
import { getServerSession } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Favourite from "@/models/Favourite";
import Listing from "@/models/Listing";
import UserNotification from "@/models/UserNotification";
import Booking from "@/models/Booking";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { LogoutRow } from "./LogoutRow";
import { AccountModeSwitch } from "./AccountModeSwitch";
import { AppBar, AppBarLink } from "@/components/layout/AppChrome";
import { TrustMark } from "@/components/TrustMark";
import { trustKind, TRUST_LABEL, verifySteps } from "@/lib/trust";
import {
  Heart, MessageSquare, ChevronRight, ShieldCheck, Rocket, Package, Store, UserRound, KeyRound,
  HelpCircle, Settings, Plus, Eye, Home, Clock, AlertTriangle, Bell, CheckCircle2, Circle, CalendarCheck } from "lucide-react";

export const metadata = { title: "My Account", robots: { index: false, follow: true } };
export const dynamic = "force-dynamic";

type Row = { href: string; icon: React.ElementType; label: string; sub?: string; tone?: "warn" | "ok" };

export default async function AccountPage() {
  const session = await getServerSession();
  if (!session) redirect("/login?callbackUrl=/dashboard");

  await dbConnect();
  const uid = new mongoose.Types.ObjectId(session.userId);
  const [user, savedCount, stats, unread] = await Promise.all([
    User.findById(uid)
      .select("name email phoneNumber profileImage createdAt isSeller verificationLevel verificationStatus verificationDoc.rejectionReason emailVerified provider city area isShop shopSlug")
      .lean() as Promise<any>,
    Favourite.countDocuments({ userId: uid }),
    Listing.aggregate([
      { $match: { userId: uid } },
      { $group: {
        _id: null,
        total: { $sum: 1 },
        live: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
        review: { $sum: { $cond: [{ $eq: ["$status", "review"] }, 1, 0] } },
        views: { $sum: { $ifNull: ["$clicks", 0] } },
        impressions: { $sum: { $ifNull: ["$impressions", 0] } },
        saves: { $sum: { $ifNull: ["$favouritesCount", 0] } },
      } },
    ]),
    UserNotification.countDocuments({ userId: uid, readAt: null }),
  ]);
  const [myOpen, forMe] = BOOKINGS_ON ? await Promise.all([
    Booking.countDocuments({ customerId: uid, status: { $in: ["pending", "confirmed"] } }),
    Booking.countDocuments({ providerId: uid, status: "pending" }),
  ]) : [0, 0];
  if (!user) redirect("/login?callbackUrl=/dashboard");

  const s = stats[0] || { total: 0, live: 0, review: 0, views: 0, impressions: 0, saves: 0 };
  const isSeller = !!user.isSeller;
  const kind = trustKind(user);
  const steps = verifySteps(user);
  const memberSince = new Date(user.createdAt || Date.now()).getFullYear();
  const vs = user.verificationStatus as string;

  const selling: Row[] = [
    { href: "/dashboard/seller", icon: Package, label: "My ads", sub: s.total ? `${s.live} live${s.review ? ` · ${s.review} in review` : ""} · ${s.total} total` : "You haven't posted yet" },
    { href: "/dashboard/plans", icon: Rocket, label: "Plans & boosts", sub: "Post more ads, feature them on top" },
    { href: "/dashboard/seller/shop", icon: Store, label: "Shop profile", sub: user.isShop ? "Manage your shop page" : "Open a shop page for your business" },
    {
      href: "/dashboard/verify", icon: vs === "pending" ? Clock : vs === "rejected" ? AlertTriangle : ShieldCheck,
      label: "Seller verification",
      sub: kind === "seller" || kind === "shop" ? "Verified — the blue seal shows on your ads" : vs === "pending" ? "Under review — we'll notify you" : vs === "rejected" ? "Rejected — please submit again" : "Your CNIC → the verified badge on every ad",
      tone: kind === "seller" || kind === "shop" ? "ok" : vs === "rejected" ? "warn" : undefined,
    },
  ];
  const bookingRows: Row[] = BOOKINGS_ON ? [{
    href: forMe ? "/dashboard/bookings?tab=received" : "/dashboard/bookings", icon: CalendarCheck, label: "Bookings",
    sub: forMe ? `${forMe} waiting for your answer` : myOpen ? `${myOpen} open` : "Qasai and hissa bookings", tone: forMe ? "warn" : undefined,
  }] : [];
  const buying: Row[] = [
    ...bookingRows,
    { href: "/dashboard/saved", icon: Heart, label: "Saved ads", sub: savedCount ? `${savedCount} saved` : "Tap the heart on an ad to save it" },
    { href: "/chat", icon: MessageSquare, label: "Messages", sub: "Chats with buyers and sellers" },
  ];
  const account: Row[] = [
    { href: "/dashboard/profile", icon: UserRound, label: "Edit profile", sub: steps.phone || isSeller ? "Name, photo, phone and city" : "Add your mobile number to get verified", tone: steps.phone || isSeller ? undefined : "warn" },
    { href: "/dashboard/profile#security", icon: KeyRound, label: "Password & security" },
    { href: "/dashboard/notifications", icon: Bell, label: "Notifications", sub: unread ? `${unread} unread` : "Offers, ad updates, plan and payment news", tone: unread ? "warn" : undefined },
    { href: "/faq", icon: HelpCircle, label: "Help & FAQ" },
  ];

  return (
    <>
      <AppBar
        title="My account"
        backHref="/"
        right={<>
          <AppBarLink href="/" label="Home"><Home className="h-5 w-5" /></AppBarLink>
          <AppBarLink href="/dashboard/profile" label="Settings"><Settings className="h-5 w-5" /></AppBarLink>
        </>}
      />
      <div className="max-w-3xl mx-auto w-full px-4 py-4 flex flex-col gap-4 pb-10">
        {/* Profile card */}
        <Link href="/dashboard/profile" className="card p-4 flex items-center gap-4">
          {user.profileImage ? (
            <Image src={user.profileImage} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-primary text-white grid place-items-center font-extrabold text-2xl">{user.name?.[0]?.toUpperCase() || "U"}</div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-[19px] font-extrabold text-content truncate leading-tight">{user.name || "Member"}</h2>
              <TrustMark kind={kind} size={18} />
            </div>
            <p className="text-xs text-content-tertiary truncate">{user.email}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className={`rounded-full px-2.5 py-0.5 text-[12.5px] font-bold ${isSeller ? "bg-primary-soft text-primary-dark" : "bg-surface-secondary text-content-secondary"}`}>{isSeller ? "Seller account" : "Buyer account"}</span>
              {kind && <span className="text-[12px] text-content-secondary">{TRUST_LABEL[kind].label}</span>}
              <span className="text-[12px] text-content-tertiary">· Member since {memberSince}</span>
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-content-tertiary shrink-0" />
        </Link>

        {/* Selling accounts: verified only after the admin approves their CNIC
            (a buyer's phone tick doesn't carry over when switching to selling). */}
        {isSeller && kind !== "seller" && kind !== "shop" && (
          <section aria-label="Verify as a seller" className={`rounded-[20px] p-4 ${steps.cnic === "rejected" ? "bg-red-50 text-red-950" : steps.cnic === "pending" ? "bg-blue-50 text-blue-950" : "bg-amber-50 text-amber-950"}`}>
            <div className="flex items-start gap-3">
              <ShieldCheck className={`h-5 w-5 shrink-0 mt-0.5 ${steps.cnic === "rejected" ? "text-red-600" : steps.cnic === "pending" ? "text-blue-600" : "text-amber-600"}`} />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{steps.cnic === "pending" ? "Your verification is under review" : "Verify as a seller"}</h2>
                <p className="text-[13px] mt-0.5 leading-snug opacity-90">
                  {steps.cnic === "pending"
                    ? "Our team is checking your CNIC — you'll get a notification and an email when it's done."
                    : steps.cnic === "rejected"
                      ? `We couldn't approve it: ${vs === "rejected" && (user as any).verificationDoc?.rejectionReason ? (user as any).verificationDoc.rejectionReason : "the photos weren't clear."} Please upload again.`
                      : "Buyers trust sellers with the verified badge. All you need is your CNIC (number, front and back)."}
                </p>
                <ul className="mt-2.5 flex flex-col gap-1.5 text-[14px]">
                  <li className="flex items-center gap-2">
                    {steps.cnic === "pending" ? <Clock className="h-4 w-4 text-blue-600" /> : steps.cnic === "rejected" ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <Circle className="h-4 w-4 opacity-60" />}
                    <span>CNIC photos (front &amp; back){steps.cnic === "pending" ? " — sent" : ""}</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Circle className="h-4 w-4 opacity-60" />
                    <span>Approved by our team</span>
                  </li>
                </ul>
                {steps.cnic !== "pending" && (
                  <Link href="/dashboard/verify" className={`mt-3 inline-flex h-11 items-center justify-center rounded-full px-5 text-sm font-semibold text-white ${steps.cnic === "rejected" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>
                    {steps.cnic === "rejected" ? "Upload again" : "Verify now"}
                  </Link>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Buying accounts aren't "verified" until they add a mobile number. */}
        {!isSeller && !kind && (
          <section aria-label="Verify your account" className="rounded-[20px] bg-amber-50 p-4 text-amber-950">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">Verify your account</h2>
                <p className="text-[13px] mt-0.5 leading-snug text-amber-900">Verified members get the green tick, and their reviews and messages are trusted more.</p>
                <ul className="mt-2.5 flex flex-col gap-1.5 text-[14px]">
                  <li className="flex items-center gap-2">
                    {steps.email ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-600" />}
                    <span className={steps.email ? "line-through decoration-amber-900/40" : ""}>Confirm your email address</span>
                  </li>
                  <li className="flex items-center gap-2">
                    {steps.phone ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-amber-600" />}
                    <span className={steps.phone ? "line-through decoration-amber-900/40" : ""}>Add your mobile number</span>
                  </li>
                </ul>
                {!steps.phone && (
                  <Link href="/dashboard/profile?verify=phone#phone" className="mt-3 inline-flex h-11 items-center justify-center rounded-full bg-amber-600 hover:bg-amber-700 px-4 text-sm font-semibold text-white">Add mobile number</Link>
                )}
              </div>
            </div>
          </section>
        )}

        <AccountModeSwitch isSeller={isSeller} />

        {isSeller ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/ads/post" className="h-12 rounded-2xl bg-primary hover:bg-primary-dark text-white text-[14.5px] font-bold flex items-center justify-center gap-2"><Plus className="h-[18px] w-[18px] stroke-[2.5]" /> Post an ad</Link>
              <Link href="/dashboard/seller" className="h-12 rounded-2xl bg-white shadow-sm text-content text-[14.5px] font-bold flex items-center justify-center gap-2"><Package className="h-[18px] w-[18px]" /> My ads</Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Live ads", value: s.live, icon: Package },
                { label: "Views", value: s.views, icon: Eye },
                { label: "Saves", value: s.saves, icon: Heart },
              ].map((t) => (
                <div key={t.label} className="card !rounded-2xl p-3.5">
                  <t.icon className="h-[18px] w-[18px] text-primary mb-2" />
                  <div className="text-[20px] font-extrabold text-content tabular-nums leading-none">{Number(t.value).toLocaleString()}</div>
                  <div className="text-[13px] text-content-tertiary mt-1">{t.label}</div>
                </div>
              ))}
            </div>
            <Menu title="Selling" rows={selling} />
          </>
        ) : (
          <Link href="/ads/post" className="group rounded-[20px] bg-primary p-4 flex items-center gap-3.5 text-white">
            <span className="grid place-items-center h-11 w-11 rounded-full bg-white/15 shrink-0"><Rocket className="h-5 w-5" /></span>
            <div className="flex-1 min-w-0">
              <h2 className="text-[15px] font-semibold leading-tight text-white">Sell something</h2>
              <p className="text-[13px] text-white/85 mt-0.5 leading-snug">Post your first ad — your account switches to Selling automatically.</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/80 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </Link>
        )}

        <Menu title="Buying" rows={buying} />
        <Menu title="Account" rows={account} footer={<LogoutRow />} />
      </div>
    </>
  );
}

function Menu({ title, rows, footer }: { title: string; rows: Row[]; footer?: React.ReactNode }) {
  return (
    <section>
      <h3 className="px-1 pb-2 text-[14px] font-bold text-content-secondary">{title}</h3>
      <div className="card overflow-hidden divide-y divide-card-border">
        {rows.map((m) => (
          <Link key={m.label} href={m.href} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-surface-secondary active:bg-surface-tertiary transition-colors">
            <span className={`grid place-items-center h-10 w-10 rounded-xl shrink-0 ${m.tone === "ok" ? "bg-primary-soft text-primary" : m.tone === "warn" ? "bg-danger-light text-danger" : "bg-surface-secondary text-content"}`}><m.icon className="h-[18px] w-[18px]" /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-[15px] font-semibold text-content">{m.label}</span>
              {m.sub && <span className="block text-[13.5px] text-content-tertiary truncate">{m.sub}</span>}
            </span>
            <ChevronRight className="h-4 w-4 text-content-tertiary shrink-0" />
          </Link>
        ))}
        {footer}
      </div>
    </section>
  );
}

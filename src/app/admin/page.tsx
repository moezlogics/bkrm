import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Tag, Users, Clock, CheckCircle, AlertTriangle, ShieldCheck, CreditCard, Flag, Wallet, PhoneCall, Hourglass, CalendarClock, ArrowRight,
} from "lucide-react";
import dbConnect from "@/lib/mongodb";
import { getServerSession } from "@/lib/auth";
import Listing from "@/models/Listing";
import User from "@/models/User";
import Category from "@/models/Category";
import City from "@/models/City";
import Invoice from "@/models/Invoice";
import UserReport from "@/models/UserReport";
import UserPurchasedPackage from "@/models/UserPurchasedPackage";
import { getScopeCounts } from "@/lib/scope-counts";
import { dailySeries, points } from "@/lib/admin-stats";
import { DayColumns, RankedBars } from "@/components/admin/DayColumns";
import { RemoveDemo } from "./RemoveDemo";
import { getPaymentMethods } from "@/lib/plan";

export const dynamic = "force-dynamic";

const n = (v: number) => (v || 0).toLocaleString("en-PK");
const c = (p: Promise<number>) => p.catch(() => 0);
const sum = (a: number[], from = 0, to = a.length) => a.slice(from, to).reduce((x, y) => x + y, 0);

async function loadDashboard() {
  await dbConnect();
  const now = Date.now();
  const weekAgo = new Date(now - 7 * 864e5);
  const pkNow = new Date(now + 5 * 3_600_000);
  const monthStart = new Date(Date.UTC(pkNow.getUTCFullYear(), pkNow.getUTCMonth(), 1) - 5 * 3_600_000);

  const [live, review, totalAds, users, usersWeek, verifications, payments, reports, expiringSoon, paying, revenueMonth, revenue30, plansEnding, recent, demo, series, scope] = await Promise.all([
    c(Listing.countDocuments({ status: "approved" }).exec()),
    c(Listing.countDocuments({ status: "review" }).exec()),
    c(Listing.estimatedDocumentCount().exec()),
    c(User.estimatedDocumentCount().exec()),
    c(User.countDocuments({ createdAt: { $gte: weekAgo } }).exec()),
    c(User.countDocuments({ verificationStatus: "pending" }).exec()),
    c(Invoice.countDocuments({ status: "submitted" }).exec()),
    c(UserReport.countDocuments({ status: "open" }).exec()),
    c(Listing.countDocuments({ status: "approved", expiresAt: { $gt: new Date(now), $lte: new Date(now + 3 * 864e5) } }).exec()),
    UserPurchasedPackage.distinct("userId", { status: "active", endDate: { $gt: new Date(now) } }).then((r) => r.length).catch(() => 0),
    Invoice.aggregate([{ $match: { status: "approved", reviewedAt: { $gte: monthStart } } }, { $group: { _id: null, t: { $sum: "$amount" }, n: { $sum: 1 } } }]).catch(() => []),
    Invoice.aggregate([{ $match: { status: "approved", reviewedAt: { $gte: new Date(now - 30 * 864e5) } } }, { $group: { _id: null, t: { $sum: "$amount" } } }]).catch(() => []),
    UserPurchasedPackage.find({ status: "active", endDate: { $gt: new Date(now), $lte: new Date(now + 7 * 864e5) } }).sort({ endDate: 1 }).limit(6)
      .populate({ path: "userId", model: User, select: "name email" }).select("planName endDate userId").lean().catch(() => []),
    Listing.find().select("name slug price status createdAt userId categoryId spamScore").sort({ createdAt: -1 }).limit(8)
      .populate({ path: "userId", model: User, select: "name" }).populate({ path: "categoryId", model: Category, select: "name" }).lean(),
    c(Listing.countDocuments({ isDemo: true }).maxTimeMS(5000).exec()),
    dailySeries(30),
    getScopeCounts().catch(() => null),
  ]);
  const payAccounts = (await getPaymentMethods()).length;

  // Busiest second-level categories (brands, for most catalogues) and cities, by live ads.
  let topCats: { label: string; value: number; href?: string }[] = [];
  let topCities: { label: string; value: number; href?: string }[] = [];
  if (scope) {
    const tops = await Category.find({ parentCategoryId: null }).select("_id").lean();
    const second: any[] = await Category.find({ parentCategoryId: { $in: tops.map((t: any) => t._id) } }).select("name").lean();
    topCats = second.map((x) => ({ label: x.name, value: scope.cat.get(String(x._id)) || 0 })).filter((x) => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 6);
    const cityIds = [...scope.city.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const cities: any[] = await City.find({ _id: { $in: cityIds.map(([id]) => id) } }).select("name").lean();
    const name = new Map(cities.map((x) => [String(x._id), x.name]));
    topCities = cityIds.map(([id, v]) => ({ label: name.get(id) || "Unknown", value: v })).filter((x) => x.label !== "Unknown");
  }

  return {
    live, review, totalAds, users, usersWeek, verifications, payments, reports, expiringSoon, paying,
    revenueMonth: (revenueMonth as any[])[0] || { t: 0, n: 0 }, revenue30: (revenue30 as any[])[0]?.t || 0,
    plansEnding: JSON.parse(JSON.stringify(plansEnding)), recent: JSON.parse(JSON.stringify(recent)), demo, series, topCats, topCities, payAccounts,
  };
}

function Tile({ label, value, sub, icon: Icon, href }: { label: string; value: string; sub?: React.ReactNode; icon: React.ElementType; href?: string }) {
  const body = (
    <div className="bg-card border border-card-border p-5 rounded-2xl flex items-start justify-between gap-3 shadow-sm h-full hover:border-primary/40 transition-colors">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-xs font-semibold text-content-secondary">{label}</span>
        <span className="text-2xl font-bold text-content">{value}</span>
        {sub && <span className="text-[11px] text-content-secondary">{sub}</span>}
      </div>
      <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-primary/10 text-primary shrink-0"><Icon className="h-5 w-5" /></div>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

const STATUS: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  approved: { label: "Live", cls: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900", icon: CheckCircle },
  review: { label: "In review", cls: "text-amber-700 bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900", icon: Clock },
  rejected: { label: "Rejected", cls: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900", icon: AlertTriangle },
  "sold out": { label: "Sold", cls: "text-zinc-600 bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800", icon: Tag },
  expired: { label: "Expired", cls: "text-zinc-600 bg-zinc-50 border-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-800", icon: Hourglass },
};

export default async function AdminDashboardPage() {
  // The layout's admin check runs in the browser; this page's data must not
  // reach anyone else, so the server checks too.
  const session = await getServerSession();
  if (!session || session.role !== "admin") redirect("/newlogin");

  const d = await loadDashboard();
  const s = d.series;
  const leads7 = sum(s.leads, -7), leadsPrev = sum(s.leads, -14, -7);
  const waiting = [
    { label: "Ads to review", value: d.review, href: "/admin/listings", icon: Clock, hint: "Held by the spam check — approve or reject" },
    { label: "ID checks", value: d.verifications, href: "/admin/verifications", icon: ShieldCheck, hint: "Sellers waiting for the verified badge" },
    { label: "Payments to verify", value: d.payments, href: "/admin/invoices", icon: CreditCard, hint: "Plans paid for, waiting for your approval" },
    { label: "Open reports", value: d.reports, href: "/admin/reports", icon: Flag, hint: "Buyers reporting an ad or a seller" },
  ];
  const waitingTotal = waiting.reduce((a, w) => a + w.value, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Dashboard</h1>
          <p className="text-xs text-content-secondary mt-1">{waitingTotal ? `${n(waitingTotal)} thing${waitingTotal === 1 ? "" : "s"} waiting for you.` : "Nothing is waiting for you."} Day-by-day numbers are in Pakistan time.</p>
        </div>
        <Link href="/admin/insights" className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline">Ad performance &amp; leads <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>

      {d.demo > 0 && <RemoveDemo count={d.demo} />}

      {/* Without a payment account the checkout can only offer WhatsApp. */}
      {d.payAccounts === 0 && (
        <div role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3 text-amber-950">
          <div className="min-w-0 flex-1">
            <p className="font-bold text-sm">Sellers can&apos;t pay for plans yet</p>
            <p className="text-[13px] mt-0.5">Add your JazzCash, Easypaisa or bank account so the checkout shows where to send the money. Until then it sends sellers to your WhatsApp.</p>
          </div>
          <Link href="/admin/invoices#payment-options" className="shrink-0 h-10 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold grid place-items-center">Add payment account</Link>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Tile label="Live ads" value={n(d.live)} sub={`${n(d.totalAds)} posted in all`} icon={Tag} href="/admin/listings?status=approved" />
        <Tile label="Accounts" value={n(d.users)} sub={`+${n(d.usersWeek)} this week`} icon={Users} href="/admin/users" />
        <Tile label="Leads (7 days)" value={n(leads7)} sub={leadsPrev ? `${leads7 >= leadsPrev ? "▲" : "▼"} ${Math.abs(Math.round(((leads7 - leadsPrev) / leadsPrev) * 100))}% vs prior week` : "Calls, WhatsApp and chats"} icon={PhoneCall} href="/admin/insights" />
        <Tile label="Revenue this month" value={`Rs ${n(d.revenueMonth.t)}`} sub={`${n(d.revenueMonth.n)} payment${d.revenueMonth.n === 1 ? "" : "s"} · Rs ${n(d.revenue30)} in 30 days`} icon={Wallet} href="/admin/invoices" />
        <Tile label="Paying sellers" value={n(d.paying)} sub="On an active plan" icon={CreditCard} href="/admin/users?plan=paid" />
        <Tile label="Ads expiring" value={n(d.expiringSoon)} sub="In the next 3 days" icon={Hourglass} href="/admin/listings?status=approved" />
      </div>

      <section className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-content mb-3">Waiting for you</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {waiting.map((w) => (
            <Link key={w.href} href={w.href} className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${w.value ? "border-amber-300 bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900" : "border-card-border hover:border-primary/40"}`}>
              <w.icon className={`h-5 w-5 shrink-0 ${w.value ? "text-amber-600" : "text-content-secondary"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-content">{w.label}</span>
                <span className="block text-[11px] text-content-secondary truncate">{w.hint}</span>
              </span>
              <span className="text-lg font-bold text-content">{n(w.value)}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DayColumns title="New ads" hint="Ads posted per day" unit="ads" data={points(s, "ads")} />
        <DayColumns title="New accounts" hint="Sign-ups per day" unit="accounts" data={points(s, "users")} />
        <DayColumns title="Ad views" hint="Ad pages opened per day (once per visitor per ad)" unit="views" data={points(s, "views")} />
        <DayColumns title="Leads" hint="Taps on Call, WhatsApp and Live Chat per day" unit="leads" data={points(s, "leads")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RankedBars title="Busiest categories (live ads)" rows={d.topCats} empty="No live ads yet." />
        <RankedBars title="Busiest cities (live ads)" rows={d.topCities} empty="No live ads with a city yet." />
        <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-content mb-3 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" />Plans ending this week</h3>
          {d.plansEnding.length === 0 ? <p className="text-xs text-content-secondary">No paid plan ends in the next 7 days.</p> : (
            <ul className="flex flex-col gap-2 text-sm">
              {d.plansEnding.map((p: any) => (
                <li key={p._id} className="flex items-center justify-between gap-2">
                  <Link href={`/admin/users?q=${encodeURIComponent(p.userId?.email || "")}`} className="truncate text-content hover:text-primary">{p.userId?.name || "Seller"} · <span className="text-content-secondary">{p.planName}</span></Link>
                  <span className="text-xs text-content-secondary shrink-0">{new Date(p.endDate).toLocaleDateString("en-PK", { day: "numeric", month: "short" })}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-[11px] text-content-secondary mt-3">A good moment to call and offer a renewal.</p>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-card-border pb-3">
          <h2 className="text-sm font-bold text-content">Latest ads</h2>
          <Link href="/admin/listings?status=all" className="text-xs font-bold text-primary hover:underline">Manage all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                <th className="py-3 px-3">Ad</th><th className="py-3 px-3">Seller</th><th className="py-3 px-3">Category</th><th className="py-3 px-3">Price</th><th className="py-3 px-3">Status</th><th className="py-3 px-3">Posted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/50 text-content">
              {d.recent.length ? d.recent.map((ad: any) => {
                const st = STATUS[ad.status] || STATUS.review;
                const Icon = st.icon;
                return (
                  <tr key={ad._id} className="hover:bg-surface-secondary/30">
                    <td className="py-3 px-3 font-semibold max-w-[260px] truncate"><Link href={`/ads/${ad.slug}`} className="hover:text-primary hover:underline">{ad.name}</Link></td>
                    <td className="py-3 px-3 text-content-secondary">{ad.userId?.name || "Unknown"}</td>
                    <td className="py-3 px-3"><span className="bg-surface-secondary border border-card-border px-2 py-0.5 rounded text-xs">{ad.categoryId?.name || "Uncategorized"}</span></td>
                    <td className="py-3 px-3 font-bold whitespace-nowrap">{ad.price != null ? `Rs ${n(ad.price)}` : "—"}</td>
                    <td className="py-3 px-3"><span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded border ${st.cls}`}><Icon className="h-3 w-3" /> {st.label}</span></td>
                    <td className="py-3 px-3 text-xs text-content-secondary whitespace-nowrap">{new Date(ad.createdAt).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" })}</td>
                  </tr>
                );
              }) : <tr><td colSpan={6} className="py-8 text-center text-content-secondary">No ads yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

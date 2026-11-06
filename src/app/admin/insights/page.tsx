import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Radio, Eye, PhoneCall, MessageCircle, Phone, Flame } from "lucide-react";
import dbConnect from "@/lib/mongodb";
import { getServerSession } from "@/lib/auth";
import Listing from "@/models/Listing";
import User from "@/models/User";
import Category from "@/models/Category";
import { dailySeries, points } from "@/lib/admin-stats";
import { DayColumns } from "@/components/admin/DayColumns";

/**
 * "Which ads, sellers and categories actually get buyers in touch?"
 *
 * The funnel in the order it happens — shown in a list → opened → contacted —
 * across the whole site, with the ratios worked out, and the leaders by leads.
 */
export const dynamic = "force-dynamic";

const n = (v: number) => (v || 0).toLocaleString("en-PK");
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 1000) / 10}%` : "—");
const LEADS = { $add: [{ $ifNull: ["$phoneClicks", 0] }, { $ifNull: ["$whatsappClicks", 0] }, { $ifNull: ["$chatClicks", 0] }] };

async function load() {
  await dbConnect();
  const opt = { maxTimeMS: 15_000 };
  const [totals, topAds, topSellers, byCat, series] = await Promise.all([
    Listing.aggregate([{ $group: { _id: null, imp: { $sum: "$impressions" }, views: { $sum: "$clicks" }, calls: { $sum: "$phoneClicks" }, wa: { $sum: "$whatsappClicks" }, chats: { $sum: "$chatClicks" }, saves: { $sum: "$favouritesCount" }, live: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, ads: { $sum: 1 } } }]).option(opt),
    Listing.aggregate([
      { $match: { status: { $in: ["approved", "sold out"] } } },
      { $addFields: { leads: LEADS } },
      { $sort: { leads: -1, clicks: -1 } },
      { $limit: 10 },
      { $project: { name: 1, slug: 1, status: 1, price: 1, clicks: 1, impressions: 1, leads: 1, userId: 1, phoneClicks: 1, whatsappClicks: 1, chatClicks: 1 } },
    ]).option(opt),
    Listing.aggregate([
      { $group: { _id: "$userId", leads: { $sum: LEADS }, views: { $sum: "$clicks" }, live: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } }, ads: { $sum: 1 } } },
      { $match: { $or: [{ leads: { $gt: 0 } }, { views: { $gt: 0 } }] } },
      { $sort: { leads: -1, views: -1 } },
      { $limit: 10 },
    ]).option(opt),
    Listing.aggregate([
      { $project: { top: { $first: "$allCategoryIds" }, live: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] }, clicks: 1, leads: LEADS } },
      { $group: { _id: "$top", live: { $sum: "$live" }, ads: { $sum: 1 }, views: { $sum: "$clicks" }, leads: { $sum: "$leads" } } },
      { $sort: { leads: -1, views: -1 } },
      { $limit: 12 },
    ]).option(opt),
    dailySeries(30),
  ]);

  const ids = [...new Set([...topAds.map((a: any) => String(a.userId)), ...topSellers.map((s: any) => String(s._id))])];
  const people = new Map(((await User.find({ _id: { $in: ids } }).select("name email isShop shopName").lean()) as any[]).map((u) => [String(u._id), u]));
  const cats = new Map(((await Category.find({ _id: { $in: byCat.map((c: any) => c._id).filter(Boolean) } }).select("name").lean()) as any[]).map((c) => [String(c._id), c.name]));
  return { t: totals[0] || {}, topAds, topSellers, byCat, series, people, cats };
}

function Stage({ icon: Icon, label, value, note }: { icon: React.ElementType; label: string; value: number; note: string }) {
  return (
    <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold text-content-secondary"><Icon className="h-4 w-4 text-primary" />{label}</div>
      <div className="text-2xl font-bold text-content mt-1">{n(value)}</div>
      <div className="text-[12px] text-content-secondary mt-0.5">{note}</div>
    </div>
  );
}

export default async function InsightsPage() {
  const session = await getServerSession();
  if (!session || session.role !== "admin") redirect("/newlogin");
  const { t, topAds, topSellers, byCat, series, people, cats } = await load();
  const leads = (t.calls || 0) + (t.wa || 0) + (t.chats || 0);
  const best = topAds[0]?.leads || 0;
  const th = "py-2.5 px-3 text-xs text-content-secondary font-bold uppercase tracking-wider";
  const td = "py-2.5 px-3";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-content tracking-tight">Insights</h1>
        <p className="text-xs text-content-secondary mt-1">How many people see the ads, open them, and get in touch — across the whole site. A visitor is counted once per ad per browsing session.</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stage icon={Radio} label="Shown in lists" value={t.imp || 0} note="Times an ad card came on screen" />
        <Stage icon={Eye} label="Ads opened" value={t.views || 0} note={`${pct(t.views || 0, t.imp || 0)} of people who saw a card`} />
        <Stage icon={PhoneCall} label="Got in touch" value={leads} note={`${pct(leads, t.views || 0)} of people who opened an ad`} />
        <Stage icon={Flame} label="Saved" value={t.saves || 0} note={`${n(t.live || 0)} live of ${n(t.ads || 0)} ads`} />
      </div>

      <div className="bg-card border border-card-border rounded-2xl p-5 shadow-sm">
        <h2 className="text-sm font-bold text-content mb-3">How buyers get in touch</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          {[{ icon: Phone, label: "Calls", v: t.calls || 0 }, { icon: MessageCircle, label: "WhatsApp", v: t.wa || 0 }, { icon: MessageCircle, label: "Live chat", v: t.chats || 0 }].map((x) => (
            <div key={x.label} className="rounded-xl bg-surface-secondary p-3">
              <x.icon className="h-4 w-4 mx-auto text-primary" />
              <div className="text-lg font-bold text-content mt-1">{n(x.v)}</div>
              <div className="text-[12px] text-content-secondary">{x.label} · {pct(x.v, leads)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DayColumns title="Ad views" hint="Ad pages opened per day" unit="views" data={points(series, "views")} />
        <DayColumns title="Leads" hint="Calls, WhatsApp and chats started per day" unit="leads" data={points(series, "leads")} />
      </div>

      <section className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        <h2 className="text-sm font-bold text-content px-5 pt-5">Ads getting the most leads</h2>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-left border-collapse text-sm">
            <thead><tr className="border-b border-card-border"><th className={th}>Ad</th><th className={th}>Seller</th><th className={`${th} text-right`}>Views</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Contact rate</th></tr></thead>
            <tbody className="divide-y divide-card-border/50">
              {topAds.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-content-secondary">No leads yet. They appear as buyers tap Call, WhatsApp or Chat.</td></tr> : topAds.map((a: any) => {
                const p = people.get(String(a.userId));
                return (
                  <tr key={String(a._id)}>
                    <td className={`${td} max-w-[280px]`}>
                      <Link href={`/ads/${a.slug}`} className="font-semibold hover:text-primary truncate block">{a.name}</Link>
                      <div className="mt-1 h-1 w-full max-w-[200px] rounded-full bg-surface-secondary overflow-hidden"><div className="h-full rounded-full bg-[#2a78d6] dark:bg-[#3987e5]" style={{ width: `${best ? Math.max(3, (a.leads / best) * 100) : 0}%` }} /></div>
                    </td>
                    <td className={td}>{p ? <Link href={`/admin/users?q=${encodeURIComponent(p.email)}`} className="hover:text-primary">{p.isShop ? p.shopName || p.name : p.name}</Link> : "—"}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(a.clicks || 0)}</td>
                    <td className={`${td} text-right tabular-nums font-bold`}>{n(a.leads)}</td>
                    <td className={`${td} text-right tabular-nums text-content-secondary`}>{pct(a.leads, a.clicks || 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
          <h2 className="text-sm font-bold text-content px-5 pt-5">Sellers getting the most leads</h2>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-sm">
              <thead><tr className="border-b border-card-border"><th className={th}>Seller</th><th className={`${th} text-right`}>Live ads</th><th className={`${th} text-right`}>Views</th><th className={`${th} text-right`}>Leads</th></tr></thead>
              <tbody className="divide-y divide-card-border/50">
                {topSellers.map((s: any) => {
                  const p = people.get(String(s._id));
                  return (
                    <tr key={String(s._id)}>
                      <td className={td}>{p ? <Link href={`/admin/users?q=${encodeURIComponent(p.email)}`} className="font-semibold hover:text-primary">{p.isShop ? p.shopName || p.name : p.name}</Link> : "Deleted account"}</td>
                      <td className={`${td} text-right tabular-nums`}>{n(s.live)}</td>
                      <td className={`${td} text-right tabular-nums`}>{n(s.views)}</td>
                      <td className={`${td} text-right tabular-nums font-bold`}>{n(s.leads)}</td>
                    </tr>
                  );
                })}
                {topSellers.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-content-secondary">No activity yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
        <section className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
          <h2 className="text-sm font-bold text-content px-5 pt-5">By section</h2>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-left border-collapse text-sm">
              <thead><tr className="border-b border-card-border"><th className={th}>Section</th><th className={`${th} text-right`}>Live ads</th><th className={`${th} text-right`}>Views</th><th className={`${th} text-right`}>Leads</th><th className={`${th} text-right`}>Leads / live ad</th></tr></thead>
              <tbody className="divide-y divide-card-border/50">
                {byCat.map((c: any) => (
                  <tr key={String(c._id)}>
                    <td className={`${td} font-semibold`}>{cats.get(String(c._id)) || "Other"}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(c.live)}</td>
                    <td className={`${td} text-right tabular-nums`}>{n(c.views)}</td>
                    <td className={`${td} text-right tabular-nums font-bold`}>{n(c.leads)}</td>
                    <td className={`${td} text-right tabular-nums text-content-secondary`}>{c.live ? (c.leads / c.live).toFixed(1) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

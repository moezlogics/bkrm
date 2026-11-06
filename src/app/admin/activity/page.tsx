"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { History, Loader2, Search, X, ChevronLeft, ChevronRight, User as UserIcon, Megaphone, CreditCard, Flag, Settings, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { withBasePath } from "@/lib/base-path";

interface Row {
  _id: string;
  adminId?: string | null;
  adminName: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: string | null;
  ip?: string | null;
  createdAt: string;
}

const LABEL: Record<string, string> = {
  "user.block": "Blocked an account", "user.unblock": "Unblocked an account", "user.makeAdmin": "Made someone admin",
  "user.makeUser": "Removed admin rights", "user.verifyId": "Marked an ID verified", "user.unverifyId": "Removed ID verification",
  "user.signOut": "Signed someone out everywhere", "user.note": "Edited a private note", "user.grantPlan": "Gave a plan",
  "user.endPlan": "Ended a plan", "user.delete": "Deleted an account",
  "listing.approve": "Approved", "listing.reject": "Rejected", "listing.sold": "Marked sold", "listing.delete": "Deleted ads",
  "invoice.approve": "Approved a payment", "invoice.reject": "Rejected a payment",
  "verification.approve": "Approved an ID", "verification.reject": "Rejected an ID",
  "report.resolve": "Resolved reports", "report.dismiss": "Dismissed reports", "report.reopen": "Reopened reports", "report.delete": "Deleted a report",
  "settings.update": "Changed settings", "demo.remove": "Removed demo data", "chat.view": "Read a conversation of", "booking.cancel": "Cancelled a booking",
};
const ICON: Record<string, React.ElementType> = { user: UserIcon, listing: Megaphone, invoice: CreditCard, report: Flag, settings: Settings, verification: ShieldCheck, plan: CreditCard, site: Settings, booking: CreditCard };
const TYPES = [
  { v: "", l: "Everything" }, { v: "user", l: "Accounts" }, { v: "listing", l: "Ads" }, { v: "invoice", l: "Payments" },
  { v: "report", l: "Reports" }, { v: "settings", l: "Settings" },
];
const when = (iso: string) => new Date(iso).toLocaleString("en-PK", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const danger = (a: string) => /block$|delete|reject|makeUser/.test(a) && a !== "user.unblock";

function ActivityPage() {
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const target = sp.get("target") || "";
  const [type, setType] = useState("");
  const [admin, setAdmin] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [admins, setAdmins] = useState<{ _id: string; name: string; email: string; n: number }[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page: String(page) });
      if (type) p.set("type", type);
      if (admin) p.set("admin", admin);
      if (q.trim()) p.set("q", q.trim());
      if (target) p.set("target", target);
      const j = await fetch(withBasePath(`/api/admin/activity?${p}`)).then((r) => r.json());
      if (!j.success) throw new Error(j.message);
      setRows(j.data); setTotal(j.total); setPages(j.pages); setAdmins(j.admins || []);
    } catch (e: any) { toast.error(e.message || "Failed to load the activity log"); } finally { setLoading(false); }
  }, [page, type, admin, q, target, toast]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const sel = "bg-surface-secondary border border-card-border rounded-xl px-3 py-2.5 text-sm text-content outline-none focus:border-primary";
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-content tracking-tight">Activity log</h1>
        <p className="text-xs text-content-secondary mt-1">Who approved, blocked, refunded or deleted what, and when. Kept for a year.</p>
      </div>
      {target && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <span>Showing activity on one item</span>
          <button onClick={() => router.replace("/admin/activity")} className="inline-flex items-center gap-1 text-xs font-bold text-primary"><X className="h-3.5 w-3.5" /> Everything</button>
        </div>
      )}
      <div className="bg-card border border-card-border rounded-2xl shadow-sm p-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-secondary" />
          <input type="search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Name, ad, email…" className={`${sel} w-full pl-10`} />
        </div>
        <select aria-label="Kind" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className={sel}>
          {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
        </select>
        <select aria-label="Admin" value={admin} onChange={(e) => { setAdmin(e.target.value); setPage(1); }} className={sel}>
          <option value="">Every admin</option>
          {admins.map((a) => <option key={a._id} value={a._id}>{a.name || a.email} ({a.n})</option>)}
        </select>
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b border-card-border text-xs text-content-secondary">
          <span className="font-bold text-content flex items-center gap-2"><History className="h-4 w-4 text-primary" />{total.toLocaleString("en-PK")} entries</span>
          {pages > 1 && <span>Page {page} of {pages}</span>}
        </div>
        {loading && !rows.length ? (
          <div className="p-16 flex justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
        ) : rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-content-secondary">Nothing recorded yet. Admin actions show up here as they happen.</p>
        ) : (
          <ul className="divide-y divide-card-border/60">
            {rows.map((r) => {
              const Icon = ICON[r.targetType] || History;
              return (
                <li key={r._id} className="px-5 py-3.5 flex gap-3">
                  <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${danger(r.action) ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary"}`}><Icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-content">
                      <span className="font-semibold">{r.adminName || r.adminEmail || "An admin"}</span>{" "}
                      <span className="text-content-secondary">{(LABEL[r.action] || r.action).toLowerCase()}</span>{" "}
                      {r.targetLabel && (r.targetType === "user" && r.targetId
                        ? <Link href={`/admin/users?q=${encodeURIComponent(r.targetId)}`} className="font-semibold hover:text-primary">{r.targetLabel}</Link>
                        : <span className="font-semibold">{r.targetLabel}</span>)}
                    </p>
                    {r.details && <p className="text-xs text-content-secondary mt-0.5 break-words">{r.details}</p>}
                    <p className="text-[11px] text-content-secondary mt-0.5">{when(r.createdAt)}{r.ip ? ` · ${r.ip}` : ""}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 p-4 border-t border-card-border">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminActivityPage() {
  return <Suspense fallback={null}><ActivityPage /></Suspense>;
}

"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search, MoreVertical, ShieldCheck, ShieldOff, UserCheck, UserX, BadgeCheck, Ban, CheckCircle2, Store,
  Loader2, Users as UsersIcon, Download, X, Gift, LogOut, Trash2, Eye, ChevronLeft, ChevronRight, StickyNote,
  Phone, Mail, MapPin, CalendarDays, Clock, Megaphone, Flag, CreditCard, History,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { withBasePath } from "@/lib/base-path";

interface AdminUser {
  _id: string;
  name: string;
  email: string;
  phoneNumber?: string | null;
  profileImage?: string | null;
  city?: string | null;
  state?: string | null;
  role: "user" | "admin";
  isBlocked: boolean;
  blockReason?: string | null;
  verificationLevel: 0 | 1 | 2 | 3;
  verificationStatus?: string;
  isPhoneVerified: boolean;
  isCnicVerified: boolean;
  emailVerified?: boolean;
  provider?: string;
  rating: number;
  ratingCount: number;
  isShop: boolean;
  shopName?: string | null;
  shopSlug?: string | null;
  isSeller?: boolean;
  createdAt: string;
  lastLoginAt?: string | null;
  listingCount: number;
  liveCount: number;
  plan: { name: string; endDate: string } | null;
}

type Counts = { all: number; admins: number; blocked: number; verified: number; shops: number; newWeek: number; pending: number; paid: number };
type Filters = { search: string; role: string; status: string; verified: string; type: string; plan: string; joined: string; sort: string };
const EMPTY: Filters = { search: "", role: "", status: "", verified: "", type: "", plan: "", joined: "", sort: "newest" };
type Plan = { _id: string; name: string; finalPrice: number; durationDays: number; listingLimit: number; featuredLimit: number };

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-PK", { day: "numeric", month: "short", year: "numeric" }) : "—");
const ago = (iso?: string | null) => {
  if (!iso) return "Never";
  const s = (Date.now() - +new Date(iso)) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)} days ago`;
  return fmtDate(iso);
};
const n = (v: number) => (v || 0).toLocaleString("en-PK");

async function api(method: string, body: unknown) {
  const res = await fetch(withBasePath("/api/admin/users"), { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.success) throw new Error(j.message || "Something went wrong");
  return j;
}

function UsersPage() {
  const { toast } = useToast();
  const { data: session } = useSession();
  const meId = (session as any)?.userId || session?.user?.id || null;
  const sp = useSearchParams();

  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, search: sp.get("q") || "" }));
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // ?open=<id> (from the full profile page) opens that account's drawer.
  const [detailId, setDetailId] = useState<string | null>(() => sp.get("open"));
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const [granting, setGranting] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && !(k === "sort" && v === "newest")) p.set(k, v.trim());
    return p;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams(params);
      p.set("page", String(page));
      p.set("limit", "25");
      const res = await fetch(withBasePath(`/api/admin/users?${p}`));
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      setUsers(j.data || []);
      setCounts(j.counts);
      setTotal(j.total);
      setPages(j.pages);
    } catch (e: any) {
      toast.error(e.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, [params, page, toast]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(load, 300);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [load, reloadKey]);

  const setFilter = (k: keyof Filters, v: string) => { setPage(1); setFilters((f) => ({ ...f, [k]: v })); };
  const refresh = () => setReloadKey((k) => k + 1);

  async function act(u: AdminUser, action: string, extra: Record<string, unknown> = {}, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setOpenMenu(null);
    setBusyId(u._id);
    try {
      const j = await api("PATCH", { userId: u._id, action, ...extra });
      toast.success(j.message || "Updated");
      refresh();
      window.dispatchEvent(new Event("admin-user-changed"));
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const chips: { label: string; value: number | undefined; on: boolean; apply: () => void }[] = [
    { label: "All", value: counts?.all, on: !filters.role && !filters.status && !filters.verified && !filters.type && !filters.plan && !filters.joined, apply: () => { setPage(1); setFilters((f) => ({ ...EMPTY, search: f.search, sort: f.sort })); } },
    { label: "New this week", value: counts?.newWeek, on: filters.joined === "week", apply: () => setFilter("joined", filters.joined === "week" ? "" : "week") },
    { label: "Paying", value: counts?.paid, on: filters.plan === "paid", apply: () => setFilter("plan", filters.plan === "paid" ? "" : "paid") },
    { label: "ID verified", value: counts?.verified, on: filters.verified === "id", apply: () => setFilter("verified", filters.verified === "id" ? "" : "id") },
    { label: "Awaiting ID check", value: counts?.pending, on: filters.verified === "pending", apply: () => setFilter("verified", filters.verified === "pending" ? "" : "pending") },
    { label: "Shops", value: counts?.shops, on: filters.type === "shop", apply: () => setFilter("type", filters.type === "shop" ? "" : "shop") },
    { label: "Admins", value: counts?.admins, on: filters.role === "admin", apply: () => setFilter("role", filters.role === "admin" ? "" : "admin") },
    { label: "Blocked", value: counts?.blocked, on: filters.status === "blocked", apply: () => setFilter("status", filters.status === "blocked" ? "" : "blocked") },
  ];
  const filtered = JSON.stringify({ ...filters, sort: "newest" }) !== JSON.stringify({ ...EMPTY });
  const sel = "bg-surface-secondary border border-card-border rounded-xl px-3 py-2.5 text-sm text-content outline-none focus:border-primary";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">User Management</h1>
          <p className="text-xs text-content-secondary mt-1">Search, verify, give plans, block or remove accounts. Every change is recorded in the activity log.</p>
        </div>
        <a
          href={withBasePath(`/api/admin/users?${new URLSearchParams([...params, ["format", "csv"]])}`)}
          className="inline-flex items-center gap-2 self-start sm:self-auto h-10 px-4 rounded-xl border border-card-border bg-card text-sm font-semibold text-content hover:border-primary hover:text-primary"
        >
          <Download className="h-4 w-4" /> Export CSV
        </a>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1" aria-label="Quick filters">
        {chips.map((c) => (
          <button
            key={c.label}
            onClick={c.apply}
            className={`shrink-0 inline-flex items-center gap-2 h-9 px-3.5 rounded-full border text-xs font-bold transition-colors ${c.on ? "bg-primary border-primary text-white" : "bg-card border-card-border text-content hover:border-primary"}`}
          >
            {c.label}
            <span className={`tabular-nums ${c.on ? "text-white/80" : "text-content-secondary"}`}>{c.value == null ? "…" : n(c.value)}</span>
          </button>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-sm p-4 flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-secondary" />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => setFilter("search", e.target.value)}
            placeholder="Name, shop, email, phone or user ID…"
            className="w-full bg-surface-secondary border border-card-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none text-content focus:border-primary"
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-2">
          <select aria-label="Role" className={sel} value={filters.role} onChange={(e) => setFilter("role", e.target.value)}>
            <option value="">All roles</option><option value="user">Members</option><option value="admin">Admins</option>
          </select>
          <select aria-label="Status" className={sel} value={filters.status} onChange={(e) => setFilter("status", e.target.value)}>
            <option value="">Any status</option><option value="active">Active</option><option value="blocked">Blocked</option>
          </select>
          <select aria-label="Verification" className={sel} value={filters.verified} onChange={(e) => setFilter("verified", e.target.value)}>
            <option value="">Any verification</option><option value="id">ID verified</option><option value="phone">Phone only</option><option value="none">Not verified</option><option value="pending">Awaiting ID check</option>
          </select>
          <select aria-label="Type" className={sel} value={filters.type} onChange={(e) => setFilter("type", e.target.value)}>
            <option value="">Everyone</option><option value="seller">Sellers</option><option value="shop">Shops</option><option value="individual">Not a shop</option>
          </select>
          <select aria-label="Plan" className={sel} value={filters.plan} onChange={(e) => setFilter("plan", e.target.value)}>
            <option value="">Any plan</option><option value="paid">On a paid plan</option><option value="free">Free</option>
          </select>
          <select aria-label="Sort" className={sel} value={filters.sort} onChange={(e) => setFilter("sort", e.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name A–Z</option><option value="login">Last signed in</option>
          </select>
        </div>
        {filtered && (
          <button onClick={() => { setPage(1); setFilters(EMPTY); }} className="self-start inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            <X className="h-3.5 w-3.5" /> Clear filters
          </button>
        )}
      </div>

      <div className="bg-card border border-card-border rounded-2xl shadow-sm p-2 sm:p-4">
        <div className="flex items-center justify-between px-2 pb-3 text-xs text-content-secondary">
          <span>{loading ? "Loading…" : `${n(total)} ${total === 1 ? "account" : "accounts"}`}</span>
          {pages > 1 && <span>Page {page} of {pages}</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                <th className="py-3 px-3">User</th>
                <th className="py-3 px-3">Contact</th>
                <th className="py-3 px-3">Plan</th>
                <th className="py-3 px-3">Ads</th>
                <th className="py-3 px-3">Trust</th>
                <th className="py-3 px-3">Joined</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-card-border/50 text-content">
              {loading && !users.length ? (
                <tr><td colSpan={7} className="py-12 text-center text-content-secondary"><Loader2 className="h-5 w-5 animate-spin inline-block" /></td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-content-secondary"><UsersIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />No accounts match.</td></tr>
              ) : (
                users.map((u) => {
                  const isSelf = !!meId && u._id === meId;
                  return (
                    <tr key={u._id} className={`hover:bg-surface-secondary/30 transition-colors ${busyId === u._id ? "opacity-60" : ""}`}>
                      <td className="py-3 px-3">
                        <button onClick={() => setDetailId(u._id)} className="flex items-center gap-3 text-left group">
                          <Avatar u={u} />
                          <div className="min-w-0">
                            <div className="font-semibold truncate max-w-[200px] flex items-center gap-1.5 group-hover:text-primary">
                              {u.name}
                              {isSelf && <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">You</span>}
                              {u.role === "admin" && <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Admin" />}
                            </div>
                            <div className="text-xs text-content-secondary flex items-center gap-1 truncate max-w-[200px]">
                              {u.isShop ? <><Store className="h-3 w-3 shrink-0" />{u.shopName || "Shop"}</> : [u.city, u.state].filter(Boolean).join(", ") || "—"}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <div className="truncate max-w-[210px]">{u.email}</div>
                        <div className="text-xs text-content-secondary">{u.phoneNumber || "—"}</div>
                      </td>
                      <td className="py-3 px-3">
                        {u.plan ? (
                          <div><div className="font-semibold text-emerald-600">{u.plan.name}</div><div className="text-xs text-content-secondary">till {fmtDate(u.plan.endDate)}</div></div>
                        ) : <span className="text-xs text-content-secondary">Free</span>}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap"><span className="font-bold">{u.liveCount}</span><span className="text-content-secondary"> live / {u.listingCount}</span></td>
                      <td className="py-3 px-3"><div className="flex flex-col gap-1 items-start"><TrustBadge u={u} />{u.isBlocked && <Pill tone="danger" icon={<Ban className="h-3 w-3" />}>Blocked</Pill>}</div></td>
                      <td className="py-3 px-3 text-xs text-content-secondary whitespace-nowrap">
                        <div>{fmtDate(u.createdAt)}</div>
                        <div title="Last sign-in">Seen {ago(u.lastLoginAt).toLowerCase()}</div>
                      </td>
                      <td className="py-3 px-3 text-right relative">
                        <button
                          onClick={() => setOpenMenu(openMenu === u._id ? null : u._id)}
                          disabled={busyId === u._id}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-lg border border-card-border hover:bg-surface-secondary text-content disabled:opacity-50"
                          aria-label={`Actions for ${u.name}`}
                        >
                          {busyId === u._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
                        </button>
                        {openMenu === u._id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                            <div className="absolute right-3 top-11 z-20 w-56 bg-card border border-card-border rounded-xl shadow-lg py-1 text-left">
                              <MenuItem icon={<Eye className="h-4 w-4" />} label="View details" onClick={() => { setOpenMenu(null); setDetailId(u._id); }} />
                              <MenuItem icon={<Gift className="h-4 w-4" />} label="Give a plan" onClick={() => { setOpenMenu(null); setGranting(u); }} />
                              {u.verificationLevel >= 2
                                ? <MenuItem icon={<ShieldOff className="h-4 w-4" />} label="Remove ID verification" onClick={() => act(u, "unverifyId", {}, `Remove ${u.name}'s verified badge?`)} />
                                : <MenuItem icon={<BadgeCheck className="h-4 w-4" />} label="Mark ID as verified" onClick={() => act(u, "verifyId", {}, `Give ${u.name} the verified badge?`)} />}
                              {u.role === "admin"
                                ? <MenuItem icon={<UserX className="h-4 w-4" />} label="Remove admin rights" danger disabled={isSelf} onClick={() => act(u, "makeUser", {}, `Remove admin rights from ${u.name}? It applies straight away.`)} />
                                : <MenuItem icon={<ShieldCheck className="h-4 w-4" />} label="Make admin" disabled={u.isBlocked} onClick={() => act(u, "makeAdmin", {}, `Give ${u.name} full admin access?`)} />}
                              <MenuItem icon={<LogOut className="h-4 w-4" />} label="Sign out everywhere" disabled={isSelf} onClick={() => act(u, "signOut", {}, `Sign ${u.name} out on every device?`)} />
                              <div className="my-1 border-t border-card-border" />
                              {u.isBlocked
                                ? <MenuItem icon={<UserCheck className="h-4 w-4" />} label="Unblock" onClick={() => act(u, "unblock", {}, `Unblock ${u.name}? Ads hidden by the block go back live.`)} />
                                : <MenuItem icon={<Ban className="h-4 w-4" />} label="Block…" danger disabled={isSelf || u.role === "admin"} onClick={() => { setOpenMenu(null); setBlocking(u); }} />}
                              <MenuItem icon={<Trash2 className="h-4 w-4" />} label="Delete account…" danger disabled={isSelf || u.role === "admin"} onClick={() => { setOpenMenu(null); setDeleting(u); }} />
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 pt-4 px-2">
            <button disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Prev</button>
            <span className="text-sm text-content-secondary tabular-nums">{page} / {pages}</span>
            <button disabled={page >= pages || loading} onClick={() => setPage((p) => p + 1)} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-card-border text-sm font-semibold disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button>
          </div>
        )}
      </div>

      {detailId && (
        <UserDrawer
          id={detailId}
          meId={meId}
          onClose={() => setDetailId(null)}
          onAction={(u, a, extra, msg) => act(u, a, extra, msg)}
          onBlock={setBlocking}
          onGrant={setGranting}
          onDelete={setDeleting}
        />
      )}
      <BlockDialog user={blocking} onClose={() => setBlocking(null)} onDone={(u, reason, hideAds) => act(u, "block", { reason, hideAds }).then((ok) => ok && setBlocking(null))} />
      <GrantDialog user={granting} onClose={() => setGranting(null)} onDone={(u, packageId, days) => act(u, "grantPlan", { packageId, days }).then((ok) => ok && setGranting(null))} />
      <DeleteDialog
        user={deleting}
        onClose={() => setDeleting(null)}
        onDone={async (u, confirm) => {
          try {
            const j = await api("DELETE", { userId: u._id, confirm });
            toast.success(j.message);
            setDeleting(null);
            setDetailId(null);
            refresh();
          } catch (e: any) { toast.error(e.message); }
        }}
      />
    </div>
  );
}

export default function AdminUsersPage() {
  return <Suspense fallback={null}><UsersPage /></Suspense>;
}

/* ───────────────────────── pieces ───────────────────────── */

function Avatar({ u, size = 36 }: { u: Pick<AdminUser, "name" | "profileImage">; size?: number }) {
  return u.profileImage ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={u.profileImage} alt="" style={{ width: size, height: size }} className="rounded-full object-cover border border-card-border shrink-0" />
  ) : (
    <div style={{ width: size, height: size }} className="rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">{(u.name || "?").charAt(0).toUpperCase()}</div>
  );
}

function Pill({ tone, icon, children }: { tone: "ok" | "warn" | "danger" | "muted"; icon?: React.ReactNode; children: React.ReactNode }) {
  const cls = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-900",
    warn: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-900",
    danger: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/30 dark:text-rose-400 dark:border-rose-900",
    muted: "bg-surface-secondary text-content-secondary border-card-border",
  }[tone];
  return <span className={`inline-flex items-center gap-1 border rounded px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${cls}`}>{icon}{children}</span>;
}

function TrustBadge({ u }: { u: Pick<AdminUser, "verificationLevel" | "verificationStatus"> }) {
  if (u.verificationLevel >= 2) return <Pill tone="ok" icon={<BadgeCheck className="h-3 w-3" />}>ID verified</Pill>;
  if (u.verificationStatus === "pending") return <Pill tone="warn" icon={<Clock className="h-3 w-3" />}>ID to check</Pill>;
  if (u.verificationLevel >= 1) return <Pill tone="warn" icon={<CheckCircle2 className="h-3 w-3" />}>Phone</Pill>;
  return <Pill tone="muted">New</Pill>;
}

function MenuItem({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "text-danger hover:bg-danger/10" : "text-content hover:bg-surface-secondary"}`}
    >
      {icon}
      {label}
    </button>
  );
}

const STATUS_LABEL: Record<string, string> = { approved: "Live", review: "In review", rejected: "Rejected", "sold out": "Sold", expired: "Expired" };
const STATUS_TONE: Record<string, "ok" | "warn" | "danger" | "muted"> = { approved: "ok", review: "warn", rejected: "danger", "sold out": "muted", expired: "muted" };
const ACTION_LABEL: Record<string, string> = {
  "user.block": "Blocked", "user.unblock": "Unblocked", "user.makeAdmin": "Made admin", "user.makeUser": "Admin rights removed",
  "user.verifyId": "ID marked verified", "user.unverifyId": "ID verification removed", "user.signOut": "Signed out everywhere",
  "user.note": "Note", "user.grantPlan": "Plan given", "chat.view": "Read a conversation", "user.endPlan": "Plan ended", "verification.approve": "ID approved", "verification.reject": "ID rejected",
};

function Section({ title, icon, children, right }: { title: string; icon: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border border-card-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-content-secondary flex items-center gap-2">{icon}{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface-secondary rounded-lg px-3 py-2">
      <div className="text-[11px] text-content-secondary font-semibold">{label}</div>
      <div className="text-base font-bold text-content tabular-nums">{value}</div>
    </div>
  );
}

function UserDrawer({ id, meId, onClose, onAction, onBlock, onGrant, onDelete }: {
  id: string;
  meId: string | null;
  onClose: () => void;
  onAction: (u: AdminUser, action: string, extra?: Record<string, unknown>, confirmMsg?: string) => Promise<boolean | undefined>;
  onBlock: (u: AdminUser) => void;
  onGrant: (u: AdminUser) => void;
  onDelete: (u: AdminUser) => void;
}) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(withBasePath(`/api/admin/users/${id}`));
      const j = await res.json();
      if (!j.success) throw new Error(j.message);
      setD(j.data);
      setNote(j.data.user.adminNote || "");
    } catch (e: any) { setErr(e.message || "Could not load this account"); }
  }, [id]);

  useEffect(() => { setD(null); setErr(null); void load(); }, [load]);
  useEffect(() => {
    const again = () => void load();
    window.addEventListener("admin-user-changed", again);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("admin-user-changed", again); window.removeEventListener("keydown", esc); };
  }, [load, onClose]);

  const u: AdminUser | null = d ? { ...d.user, listingCount: d.ads.total, liveCount: d.ads.status.approved || 0, plan: d.plan ? { name: d.plan.planName, endDate: d.plan.endDate } : null } : null;
  const isSelf = !!u && u._id === meId;
  const leads = d ? d.ads.leads.calls + d.ads.leads.whatsapp + d.ads.leads.chats : 0;

  return (
    <div className="fixed inset-0 z-[90] flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="relative h-full w-full max-w-xl bg-card border-l border-card-border shadow-2xl flex flex-col" role="dialog" aria-modal="true" aria-label="Account details">
        <header className="flex items-center justify-between gap-3 px-5 h-16 border-b border-card-border shrink-0">
          <span className="text-sm font-bold text-content">Account details</span>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-secondary" aria-label="Close"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {err && <p className="text-sm text-danger">{err}</p>}
          {!d && !err && <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin inline-block text-primary" /></div>}
          {d && u && (
            <>
              <div className="flex items-start gap-4">
                <Avatar u={u} size={56} />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-content flex items-center gap-2 flex-wrap">
                    {u.name}
                    {u.role === "admin" && <Pill tone="ok" icon={<ShieldCheck className="h-3 w-3" />}>Admin</Pill>}
                    {u.isBlocked && <Pill tone="danger" icon={<Ban className="h-3 w-3" />}>Blocked</Pill>}
                  </h2>
                  {u.isShop && <p className="text-sm text-content-secondary flex items-center gap-1"><Store className="h-3.5 w-3.5" />{u.shopName}</p>}
                  <div className="mt-2 flex flex-wrap gap-1.5"><TrustBadge u={u} />{d.user.emailVerified === false && <Pill tone="warn">Email not confirmed</Pill>}</div>
                  {u.isBlocked && d.user.blockReason && <p className="mt-2 text-xs text-danger">Blocked {d.user.blockedAt ? `on ${fmtDate(d.user.blockedAt)}` : ""}: {d.user.blockReason}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <Info icon={<Mail className="h-4 w-4" />} value={<a href={`mailto:${u.email}`} className="hover:text-primary break-all">{u.email}</a>} />
                <Info icon={<Phone className="h-4 w-4" />} value={u.phoneNumber ? <a href={`tel:${u.phoneNumber}`} className="hover:text-primary">{u.phoneNumber}{u.isPhoneVerified ? " ✓" : ""}</a> : "No phone"} />
                <Info icon={<MapPin className="h-4 w-4" />} value={[d.user.area, u.city, u.state].filter(Boolean).join(", ") || "No location"} />
                <Info icon={<CalendarDays className="h-4 w-4" />} value={`Joined ${fmtDate(u.createdAt)} · ${d.user.provider === "google" ? "Google" : "email"} sign-up`} />
                <Info icon={<Clock className="h-4 w-4" />} value={`Last sign-in ${ago(d.user.lastLoginAt).toLowerCase()}${d.user.lastLoginIp ? ` · ${d.user.lastLoginIp}` : ""}`} />
                <Info icon={<Megaphone className="h-4 w-4" />} value={`${d.devices} device${d.devices === 1 ? "" : "s"} with notifications · ${d.saved} saved ads`} />
              </div>

              <div className="flex flex-wrap gap-2">
                {u.isShop && u.shopSlug && <a href={withBasePath(`/shop/${u.shopSlug}`)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-card-border text-xs font-bold hover:border-primary hover:text-primary"><Store className="h-3.5 w-3.5" /> Open shop</a>}
                <Link href={`/admin/listings?seller=${u._id}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-card-border text-xs font-bold hover:border-primary hover:text-primary"><Megaphone className="h-3.5 w-3.5" /> All their ads</Link>
                <Link href={`/admin/activity?target=${u._id}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-card-border text-xs font-bold hover:border-primary hover:text-primary"><History className="h-3.5 w-3.5" /> Activity log</Link>
                <Link href={`/admin/users/${u._id}`} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark">Everything on this account →</Link>
              </div>

              <Section title="Ads & leads" icon={<Megaphone className="h-3.5 w-3.5" />}>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Live" value={n(d.ads.status.approved || 0)} />
                  <Stat label="In review" value={n(d.ads.status.review || 0)} />
                  <Stat label="Sold" value={n(d.ads.status["sold out"] || 0)} />
                  <Stat label="Views" value={n(d.ads.views)} />
                  <Stat label="Leads" value={n(leads)} />
                  <Stat label="Saves" value={n(d.ads.saves)} />
                </div>
                {leads > 0 && <p className="mt-2 text-xs text-content-secondary">Leads: {n(d.ads.leads.calls)} calls · {n(d.ads.leads.whatsapp)} WhatsApp · {n(d.ads.leads.chats)} chats</p>}
                {d.ads.recent.length > 0 && (
                  <ul className="mt-3 divide-y divide-card-border/60">
                    {d.ads.recent.map((l: any) => (
                      <li key={l._id} className="py-2 flex items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {l.image ? <img src={l.image} alt="" className="h-10 w-10 rounded-md object-cover border border-card-border shrink-0" /> : <div className="h-10 w-10 rounded-md bg-surface-secondary shrink-0" />}
                        <div className="min-w-0 flex-1">
                          <a href={withBasePath(`/ads/${l.slug}`)} target="_blank" rel="noreferrer" className="text-sm font-semibold truncate block hover:text-primary">{l.name}</a>
                          <div className="text-[11px] text-content-secondary">
                            {l.price != null ? `Rs ${n(l.price)} · ` : ""}{n(l.clicks || 0)} views · {n((l.phoneClicks || 0) + (l.whatsappClicks || 0) + (l.chatClicks || 0))} leads
                            {l.status === "approved" && l.expiresAt ? ` · expires ${fmtDate(l.expiresAt)}` : ""}
                          </div>
                        </div>
                        <Pill tone={STATUS_TONE[l.status] || "muted"}>{l.blockHidden ? "Hidden (block)" : STATUS_LABEL[l.status] || l.status}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                title="Plan"
                icon={<Gift className="h-3.5 w-3.5" />}
                right={<div className="flex gap-2">
                  {d.plan && <button onClick={() => onAction(u, "endPlan", {}, `End ${u.name}'s ${d.plan.planName} plan now?`)} className="text-xs font-bold text-danger hover:underline">End plan</button>}
                  <button onClick={() => onGrant(u)} className="text-xs font-bold text-primary hover:underline">Give a plan</button>
                </div>}
              >
                {d.plan ? (
                  <p className="text-sm"><span className="font-bold text-emerald-600">{d.plan.planName}</span> until {fmtDate(d.plan.endDate)} · {d.plan.listingLimit} live ads · {d.plan.featuredUsed}/{d.plan.featuredLimit} boosts used</p>
                ) : <p className="text-sm text-content-secondary">Free allowance.</p>}
                {d.planHistory.filter((p: any) => p !== d.plan && p._id !== d.plan?._id).length > 0 && (
                  <ul className="mt-2 text-xs text-content-secondary space-y-1">
                    {d.planHistory.filter((p: any) => p._id !== d.plan?._id).map((p: any) => (
                      <li key={p._id}>{p.planName} · {fmtDate(p.startDate)} → {fmtDate(p.endDate)}{p.invoiceId ? "" : " · given by admin"}</li>
                    ))}
                  </ul>
                )}
              </Section>

              {d.invoices.length > 0 && (
                <Section title="Payments" icon={<CreditCard className="h-3.5 w-3.5" />} right={<Link href="/admin/invoices" className="text-xs font-bold text-primary hover:underline">Invoices</Link>}>
                  <ul className="text-sm divide-y divide-card-border/60">
                    {d.invoices.map((i: any) => (
                      <li key={i._id} className="py-1.5 flex items-center justify-between gap-2">
                        <span className="truncate">{i.invoiceNumber} · {i.planName}</span>
                        <span className="flex items-center gap-2 shrink-0"><span className="tabular-nums">Rs {n(i.amount)}</span><Pill tone={i.status === "approved" ? "ok" : i.status === "rejected" ? "danger" : "warn"}>{i.status.replace("_", " ")}</Pill></span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Reports" icon={<Flag className="h-3.5 w-3.5" />} right={d.reports.against > 0 ? <Link href={`/admin/reports?seller=${u._id}`} className="text-xs font-bold text-primary hover:underline">Open reports</Link> : undefined}>
                <p className="text-sm">
                  <span className={d.reports.open ? "font-bold text-danger" : ""}>{d.reports.against} against them</span>
                  {d.reports.open ? ` (${d.reports.open} open)` : ""} · {d.reports.filed} filed by them
                </p>
                {d.reports.recent.length > 0 && (
                  <ul className="mt-2 text-xs text-content-secondary space-y-1">
                    {d.reports.recent.map((r: any) => (
                      <li key={r._id}>{fmtDate(r.createdAt)} · {r.reportReasonId?.reason || r.reason || "Other"}{r.itemId?.name ? ` · “${r.itemId.name}”` : ""} · {r.status}</li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Private note (admins only)" icon={<StickyNote className="h-3.5 w-3.5" />}>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder="e.g. Called on 12 Oct — showroom in Gulberg, genuine dealer."
                  className="w-full bg-surface-secondary border border-card-border rounded-lg px-3 py-2 text-sm text-content outline-none focus:border-primary"
                />
                <button
                  disabled={savingNote || note === (d.user.adminNote || "")}
                  onClick={async () => { setSavingNote(true); await onAction(u, "note", { note }); setSavingNote(false); }}
                  className="mt-2 h-9 px-4 rounded-lg bg-primary text-white text-xs font-bold disabled:opacity-40"
                >
                  {savingNote ? "Saving…" : "Save note"}
                </button>
              </Section>

              {d.activity.length > 0 && (
                <Section title="Admin activity on this account" icon={<History className="h-3.5 w-3.5" />}>
                  <ul className="text-xs space-y-1.5">
                    {d.activity.map((a: any) => (
                      <li key={a._id} className="text-content-secondary">
                        <span className="text-content font-semibold">{ACTION_LABEL[a.action] || a.action}</span>
                        {a.details ? ` — ${a.details}` : ""} · {a.adminName || a.adminEmail || "admin"} · {fmtDate(a.createdAt)}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}

              <Section title="Account actions" icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                <div className="flex flex-wrap gap-2">
                  {u.verificationLevel >= 2
                    ? <DrawerBtn onClick={() => onAction(u, "unverifyId", {}, `Remove ${u.name}'s verified badge?`)} icon={<ShieldOff className="h-4 w-4" />}>Remove ID verification</DrawerBtn>
                    : <DrawerBtn onClick={() => onAction(u, "verifyId", {}, `Give ${u.name} the verified badge?`)} icon={<BadgeCheck className="h-4 w-4" />}>Mark ID verified</DrawerBtn>}
                  {u.role === "admin"
                    ? <DrawerBtn disabled={isSelf} onClick={() => onAction(u, "makeUser", {}, `Remove admin rights from ${u.name}?`)} icon={<UserX className="h-4 w-4" />}>Remove admin rights</DrawerBtn>
                    : <DrawerBtn disabled={u.isBlocked} onClick={() => onAction(u, "makeAdmin", {}, `Give ${u.name} full admin access?`)} icon={<ShieldCheck className="h-4 w-4" />}>Make admin</DrawerBtn>}
                  <DrawerBtn disabled={isSelf} onClick={() => onAction(u, "signOut", {}, `Sign ${u.name} out on every device?`)} icon={<LogOut className="h-4 w-4" />}>Sign out everywhere</DrawerBtn>
                  {u.isBlocked
                    ? <DrawerBtn onClick={() => onAction(u, "unblock", {}, `Unblock ${u.name}?`)} icon={<UserCheck className="h-4 w-4" />}>Unblock</DrawerBtn>
                    : <DrawerBtn danger disabled={isSelf || u.role === "admin"} onClick={() => onBlock(u)} icon={<Ban className="h-4 w-4" />}>Block…</DrawerBtn>}
                  <DrawerBtn danger disabled={isSelf || u.role === "admin"} onClick={() => onDelete(u)} icon={<Trash2 className="h-4 w-4" />}>Delete account…</DrawerBtn>
                </div>
                {u.role === "admin" && !isSelf && <p className="mt-2 text-xs text-content-secondary">Admins can't be blocked or deleted — remove their admin rights first.</p>}
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Info({ icon, value }: { icon: React.ReactNode; value: React.ReactNode }) {
  return <div className="flex items-start gap-2 text-content"><span className="text-content-secondary mt-0.5 shrink-0">{icon}</span><span className="min-w-0">{value}</span></div>;
}

function DrawerBtn({ children, icon, onClick, danger, disabled }: { children: React.ReactNode; icon: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${danger ? "border-danger/40 text-danger hover:bg-danger/10" : "border-card-border text-content hover:border-primary hover:text-primary"}`}>
      {icon}{children}
    </button>
  );
}

function BlockDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, reason: string, hideAds: boolean) => Promise<unknown> }) {
  const [reason, setReason] = useState("");
  const [hideAds, setHideAds] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) { setReason(""); setHideAds(true); } }, [user]);
  return (
    <Modal open={!!user} onClose={onClose} title={user ? `Block ${user.name}` : ""} size="sm">
      {user && (
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-content-secondary">They are signed out at once and can't sign in again until you unblock them.</p>
          <label className="text-sm font-semibold text-content flex flex-col gap-1.5">
            Reason (for the admin team)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} placeholder="e.g. Fake ads, asked buyers for advance payment" className="bg-surface-secondary border border-card-border rounded-lg px-3 py-2 text-sm font-normal outline-none focus:border-primary" />
          </label>
          <label className="flex items-start gap-2 text-sm text-content">
            <input type="checkbox" checked={hideAds} onChange={(e) => setHideAds(e.target.checked)} className="mt-0.5" />
            <span>Hide their {user.liveCount ? `${user.liveCount} ` : ""}live ads too <span className="text-content-secondary">(they come back if you unblock)</span></span>
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-lg border border-card-border text-sm font-semibold">Cancel</button>
            <button disabled={busy} onClick={async () => { setBusy(true); await onDone(user, reason, hideAds); setBusy(false); }} className="h-10 px-4 rounded-lg bg-danger text-white text-sm font-bold disabled:opacity-50">
              {busy ? "Blocking…" : "Block account"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function GrantDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, packageId: string, days?: number) => Promise<unknown> }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [planId, setPlanId] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!user) return;
    setPlanId(""); setDays("");
    if (plans) return;
    fetch(withBasePath("/api/plans")).then((r) => r.json()).then((j) => setPlans(j.data || [])).catch(() => setPlans([]));
  }, [user, plans]);
  const plan = plans?.find((p) => p._id === planId);
  return (
    <Modal open={!!user} onClose={onClose} title={user ? `Give a plan to ${user.name}` : ""} size="sm">
      {user && (
        <div className="p-5 flex flex-col gap-4">
          {plans === null ? <Loader2 className="h-5 w-5 animate-spin" /> : plans.length === 0 ? (
            <p className="text-sm text-content-secondary">There are no active paid plans. Add one in Settings → Plans first.</p>
          ) : (
            <>
              <label className="text-sm font-semibold text-content flex flex-col gap-1.5">
                Plan
                <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="bg-surface-secondary border border-card-border rounded-lg px-3 py-2.5 text-sm font-normal outline-none focus:border-primary">
                  <option value="">Choose a plan</option>
                  {plans.map((p) => <option key={p._id} value={p._id}>{p.name} — {p.listingLimit} ads, {p.durationDays} days (Rs {n(p.finalPrice)})</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-content flex flex-col gap-1.5">
                Days (optional)
                <input type="number" min={1} max={3650} value={days} onChange={(e) => setDays(e.target.value)} placeholder={plan ? String(plan.durationDays) : "Plan's own duration"} className="bg-surface-secondary border border-card-border rounded-lg px-3 py-2.5 text-sm font-normal outline-none focus:border-primary" />
              </label>
              <p className="text-xs text-content-secondary bg-surface-secondary rounded-lg px-3 py-2">No invoice or payment is recorded. The plan starts now and replaces any plan they're on.</p>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-lg border border-card-border text-sm font-semibold">Cancel</button>
            <button disabled={busy || !planId} onClick={async () => { setBusy(true); await onDone(user, planId, Number(days) || undefined); setBusy(false); }} className="h-10 px-4 rounded-lg bg-primary text-white text-sm font-bold disabled:opacity-50">
              {busy ? "Giving…" : "Give plan"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function DeleteDialog({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (u: AdminUser, confirm: string) => Promise<unknown> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (user) setTyped(""); }, [user]);
  return (
    <Modal open={!!user} onClose={onClose} title="Delete account" size="sm">
      {user && (
        <div className="p-5 flex flex-col gap-4">
          <p className="text-sm text-content">
            This permanently deletes <b>{user.name}</b>, their {user.listingCount} ads with their photos, chats, offers, reviews and saved ads. Invoices are kept. It can't be undone — to stop someone without losing anything, block them instead.
          </p>
          <label className="text-sm font-semibold text-content flex flex-col gap-1.5">
            Type <span className="font-mono text-danger break-all">{user.email}</span> to confirm
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className="bg-surface-secondary border border-card-border rounded-lg px-3 py-2.5 text-sm font-normal outline-none focus:border-danger" />
          </label>
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="h-10 px-4 rounded-lg border border-card-border text-sm font-semibold">Cancel</button>
            <button disabled={busy || typed.trim().toLowerCase() !== user.email} onClick={async () => { setBusy(true); await onDone(user, typed); setBusy(false); }} className="h-10 px-4 rounded-lg bg-danger text-white text-sm font-bold disabled:opacity-50">
              {busy ? "Deleting…" : "Delete forever"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

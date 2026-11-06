"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, Loader2, Check, X, Phone, MapPin, Mail, ExternalLink, Clock, IdCard, User as UserIcon, Copy, TriangleAlert, Package } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Req = {
  _id: string; name: string; email: string; phone?: string; phoneFromAd?: boolean; city?: string;
  status: string; level: number; ads?: { total: number; live: number }; cnicReused?: boolean;
  doc?: { docType?: string; fullName?: string; cnicNumber?: string; frontImage?: string; backImage?: string; selfieImage?: string; submittedAt?: string; reviewedAt?: string; rejectionReason?: string };
};

// One tap for the usual reasons; the seller sees the text in the app and by email.
const REASONS = [
  "The photos are blurry — please retake them in good light.",
  "Part of the card is cut off — the whole card must be in the photo.",
  "The back side of the CNIC is missing.",
  "The name on the CNIC doesn't match the account name.",
  "The CNIC number you typed doesn't match the card.",
  "This doesn't look like an original CNIC (photocopy or screenshot).",
];

const ago = (d?: string) => {
  if (!d) return "";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

export default function AdminVerifications() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Req | null>(null);
  const [reason, setReason] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/verifications?status=${tab}`);
      const j = await r.json();
      if (j.success) setRows(j.data);
      else toast.error(j.message || "Couldn't load requests");
    } catch { toast.error("Couldn't load requests"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (id: string, action: "approve" | "reject", why = "") => {
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/verifications/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason: why }) });
      const j = await r.json();
      if (j.success) {
        toast.success(action === "approve" ? `${j.message} They've been notified.` : `${j.message} They've been told why.`);
        setRejecting(null); setReason("");
        load();
        window.dispatchEvent(new Event("admin-counts-refresh"));
      } else toast.error(j.message);
    } catch { toast.error("Couldn't save — please try again"); }
    finally { setBusy(null); }
  };

  const Img = ({ src, label }: { src?: string; label: string }) => (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-content-tertiary">{label}</span>
      {src ? (
        <button onClick={() => setZoom(src)} className="aspect-[3/2] w-full rounded-lg overflow-hidden border border-card-border bg-surface-secondary hover:ring-2 hover:ring-primary/40" aria-label={`Open ${label}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={label} className="h-full w-full object-cover" />
        </button>
      ) : <div className="aspect-[3/2] rounded-lg border border-dashed border-card-border grid place-items-center text-[12px] text-content-tertiary">Not sent</div>}
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-primary" /> Seller verifications</h1>
          <p className="text-xs text-content-secondary mt-1">Check the CNIC photos against the account, then approve or reject. The seller is notified either way (push + email).</p>
        </div>
        <div className="flex rounded-lg border border-card-border overflow-hidden text-sm">
          {(["pending", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 font-semibold capitalize ${tab === t ? "bg-primary text-white" : "text-content-secondary hover:bg-surface-secondary"}`}>{t === "pending" ? "Waiting" : "All"}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card p-12 text-center text-sm text-content-secondary">{tab === "pending" ? "Nothing waiting — all caught up." : "No verification requests yet."}</div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((r) => (
            <div key={r._id} className="rounded-2xl border border-card-border bg-card p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/users/${r._id}`} className="font-bold text-content hover:text-primary">{r.name}</Link>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.status === "verified" ? "bg-emerald-50 text-emerald-700" : r.status === "rejected" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-700"}`}>
                      {r.status === "pending" ? "Waiting" : r.status === "verified" ? "Approved" : "Rejected"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-content-secondary mt-1.5">
                    <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{r.email}</span>
                    {r.phone && <span className="flex items-center gap-1" title={r.phoneFromAd ? "The number on their latest ad" : "The number on their account"}><Phone className="h-3.5 w-3.5" />{r.phone}{r.phoneFromAd ? " (on ads)" : ""}</span>}
                    <span className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />{r.ads?.total ? `${r.ads.live} live / ${r.ads.total} ads` : "No ads yet"}</span>
                    {r.city && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{r.city}</span>}
                  </div>
                </div>
                {r.doc?.submittedAt && <span className="shrink-0 flex items-center gap-1 text-[12px] text-content-tertiary"><Clock className="h-3.5 w-3.5" />{ago(r.doc.submittedAt)}</span>}
              </div>

              <div className="rounded-xl bg-surface-secondary px-3 py-2 text-[13px] text-content-secondary flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1"><IdCard className="h-3.5 w-3.5" />{(r.doc?.docType || "cnic").toUpperCase()}</span>
                <span className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5" />Name on card: <b className="text-content">{r.doc?.fullName || "not given"}</b></span>
                {r.doc?.cnicNumber && (
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(r.doc!.cnicNumber!); toast.success("CNIC number copied"); }} className="flex items-center gap-1 hover:text-primary" title="Copy">
                    <IdCard className="h-3.5 w-3.5" /> <b className="text-content font-mono tracking-wide">{r.doc.cnicNumber}</b> <Copy className="h-3 w-3" />
                  </button>
                )}
              </div>
              {r.cnicReused && (
                <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                  <TriangleAlert className="h-4 w-4 shrink-0 mt-px" /> This CNIC number was also sent from another account. Check it isn&apos;t a blocked seller coming back.
                </p>
              )}

              <div className={`grid gap-2 ${r.doc?.selfieImage ? "grid-cols-3" : "grid-cols-2"}`}>
                <Img src={r.doc?.frontImage} label="CNIC front" />
                <Img src={r.doc?.backImage} label="CNIC back" />
                {r.doc?.selfieImage && <Img src={r.doc.selfieImage} label="Selfie" />}
              </div>

              {r.status === "rejected" && r.doc?.rejectionReason && <p className="text-[13px] text-red-600">Rejected: {r.doc.rejectionReason}</p>}

              {r.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => act(r._id, "approve")} disabled={busy === r._id} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                    {busy === r._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve
                  </button>
                  <button onClick={() => { setRejecting(r); setReason(""); }} disabled={busy === r._id} className="flex-1 flex items-center justify-center gap-1.5 bg-surface border border-card-border hover:bg-red-50 text-red-600 font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {rejecting && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Reject verification">
          <div className="absolute inset-0 bg-black/60" onClick={() => busy || setRejecting(null)} />
          <div className="relative w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="font-bold text-content">Reject {rejecting.name}&apos;s verification</h3>
            <p className="text-xs text-content-secondary">Pick a reason or write your own — the seller sees it and can upload again.</p>
            <div className="flex flex-col gap-1.5">
              {REASONS.map((t) => (
                <button key={t} onClick={() => setReason(t)} className={`text-left text-[14px] rounded-lg border px-3 py-2 ${reason === t ? "border-primary bg-primary/5 text-content" : "border-card-border text-content-secondary hover:border-primary/50"}`}>{t}</button>
              ))}
            </div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="Or write a reason…" className="rounded-lg border border-card-border p-3 text-sm outline-none focus:border-primary bg-surface resize-none" />
            <div className="flex gap-2">
              <button onClick={() => setRejecting(null)} className="flex-1 h-11 rounded-lg border border-card-border text-sm font-semibold text-content">Cancel</button>
              <button onClick={() => act(rejecting._id, "reject", reason)} disabled={!reason.trim() || busy === rejecting._id} className="flex-1 h-11 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {busy === rejecting._id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/85 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-[88vh] max-w-full rounded-lg" />
          <div className="absolute top-4 right-4 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a href={zoom} target="_blank" rel="noopener" className="flex items-center gap-1 text-white text-sm bg-white/10 px-3 py-1.5 rounded-lg"><ExternalLink className="h-4 w-4" /> Open</a>
            <button onClick={() => setZoom(null)} className="text-white bg-white/10 px-3 py-1.5 rounded-lg" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

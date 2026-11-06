"use client";

import React, { useEffect, useState } from "react";
import { CreditCard, Loader2, Check, X, Plus, Trash2, Save, ExternalLink, Wallet, ChevronDown } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

type Inv = {
  _id: string; invoiceNumber: string; planName: string; amount: number; status: string;
  paymentMethod?: string; paymentScreenshot?: string; transactionNote?: string; rejectionReason?: string;
  snapshot?: { listingLimit: number; featuredLimit: number; durationDays: number };
  seller?: { name: string; email: string; phone?: string }; submittedAt?: string;
};
type PM = { type?: string; title: string; account: string; name?: string; instructions?: string };

export default function AdminInvoices() {
  const { toast } = useToast();
  const [tab, setTab] = useState<"submitted" | "approved" | "all">("submitted");
  const [rows, setRows] = useState<Inv[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);

  const [pmOpen, setPmOpen] = useState(false);
  const [methods, setMethods] = useState<PM[]>([]);
  const [savingPm, setSavingPm] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const r = await fetch(`/api/admin/invoices?status=${tab}`); const j = await r.json(); if (j.success) setRows(j.data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [tab]); // eslint-disable-line
  useEffect(() => {
    fetch("/api/admin/payment-methods").then((r) => r.json()).then((j) => {
      if (!j.success) return;
      setMethods(j.data);
      // Nothing set up yet (sellers can't pay), or arrived from the dashboard's warning: open the editor.
      if (!j.data.length || window.location.hash === "#payment-options") setPmOpen(true);
    });
  }, []);

  const act = async (id: string, action: "approve" | "reject") => {
    let reason = "";
    if (action === "reject") { reason = window.prompt("Reject ki wajah:") || ""; if (!reason) return; }
    setBusy(id);
    try {
      const r = await fetch(`/api/admin/invoices/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, reason }) });
      const j = await r.json();
      if (j.success) { toast.success(j.message); load(); } else toast.error(j.message);
    } catch { toast.error("Action fail"); } finally { setBusy(null); }
  };

  const savePm = async () => {
    setSavingPm(true);
    try {
      const r = await fetch("/api/admin/payment-methods", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ methods }) });
      const j = await r.json();
      if (j.success) { setMethods(j.data); toast.success("Payment methods saved"); } else toast.error(j.message);
    } catch { toast.error("Save fail"); } finally { setSavingPm(false); }
  };
  const setPm = (i: number, k: keyof PM, v: string) => setMethods((p) => p.map((m, x) => (x === i ? { ...m, [k]: v } : m)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-content flex items-center gap-2"><CreditCard className="h-6 w-6 text-primary" /> Invoices & Payments</h1>
          <p className="text-xs text-content-secondary mt-1">Verify seller payments — the plan activates on approval.</p>
        </div>
        <div className="flex rounded-lg border border-card-border overflow-hidden text-sm">
          {(["submitted", "approved", "all"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 font-semibold capitalize ${tab === t ? "bg-primary text-white" : "text-content-secondary hover:bg-surface-secondary"}`}>{t}</button>
          ))}
        </div>
      </div>

      {/* Payment methods editor */}
      <div id="payment-options" className={`rounded-2xl border bg-card scroll-mt-20 ${methods.length ? "border-card-border" : "border-amber-300"}`}>
        <button onClick={() => setPmOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-3">
          <span className="font-bold text-content flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" /> Payment options ({methods.length})</span>
          <ChevronDown className={`h-4 w-4 text-content-secondary transition-transform ${pmOpen ? "rotate-180" : ""}`} />
        </button>
        {pmOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3 border-t border-card-border pt-3">
            <p className="text-xs text-content-secondary">Shown to sellers at checkout with copy buttons: JazzCash, Easypaisa, a bank account (IBAN)… {!methods.length && <b className="text-amber-700">Until you add one, sellers are sent to your WhatsApp to pay.</b>}</p>
            {methods.map((m, i) => (
              <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-card-border p-3 relative">
                <input value={m.title} onChange={(e) => setPm(i, "title", e.target.value)} placeholder="Title (JazzCash)" className="h-10 rounded-lg border border-card-border px-3 text-sm bg-surface outline-none focus:border-primary" />
                <input value={m.account} onChange={(e) => setPm(i, "account", e.target.value)} placeholder="Account / number" className="h-10 rounded-lg border border-card-border px-3 text-sm bg-surface outline-none focus:border-primary" />
                <input value={m.name || ""} onChange={(e) => setPm(i, "name", e.target.value)} placeholder="Account title / name" className="h-10 rounded-lg border border-card-border px-3 text-sm bg-surface outline-none focus:border-primary" />
                <input value={m.instructions || ""} onChange={(e) => setPm(i, "instructions", e.target.value)} placeholder="Instructions (optional)" className="h-10 rounded-lg border border-card-border px-3 text-sm bg-surface outline-none focus:border-primary" />
                <button onClick={() => setMethods((p) => p.filter((_, x) => x !== i))} className="absolute -top-2 -right-2 h-6 w-6 grid place-items-center rounded-full bg-red-500 text-white"><Trash2 className="h-3 w-3" /></button>
              </div>
            ))}
            <div className="flex gap-2">
              <button onClick={() => setMethods((p) => [...p, { title: "", account: "", name: "", instructions: "" }])} className="flex items-center gap-1 rounded-lg border border-card-border px-3 py-2 text-sm font-semibold text-content-secondary hover:border-primary"><Plus className="h-4 w-4" /> Add option</button>
              <button onClick={savePm} disabled={savingPm} className="flex items-center gap-1 rounded-lg bg-primary text-white px-4 py-2 text-sm font-bold disabled:opacity-50">{savingPm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Invoices */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-card-border bg-card p-12 text-center text-sm text-content-secondary">No {tab !== "all" ? tab + " " : ""}invoices.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((iv) => (
            <div key={iv._id} className="rounded-2xl border border-card-border bg-card p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-content">{iv.invoiceNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${iv.status === "approved" ? "bg-emerald-50 text-emerald-700" : iv.status === "rejected" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-700"}`}>{iv.status}</span>
                  </div>
                  <p className="text-xs text-content-secondary mt-0.5">{iv.seller?.name} · {iv.seller?.email}{iv.seller?.phone ? " · " + iv.seller.phone : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold text-content">Rs {iv.amount.toLocaleString()}</p>
                  <p className="text-[12px] text-content-secondary">{iv.planName}</p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-[12px] text-content-secondary">
                <span>Via: <b className="text-content">{iv.paymentMethod || "—"}</b></span>
                {iv.transactionNote && <span>Ref: {iv.transactionNote}</span>}
                {iv.snapshot && <span className="ml-auto">{iv.snapshot.listingLimit} listings · {iv.snapshot.featuredLimit} featured</span>}
              </div>

              {iv.paymentScreenshot && (
                <button onClick={() => setZoom(iv.paymentScreenshot!)} className="h-40 w-full rounded-lg overflow-hidden border border-card-border bg-surface-secondary">
                  <img src={iv.paymentScreenshot} alt="payment" className="h-full w-full object-contain" />
                </button>
              )}
              {iv.status === "rejected" && iv.rejectionReason && <p className="text-[12px] text-red-600">Rejected: {iv.rejectionReason}</p>}

              {iv.status === "submitted" && (
                <div className="flex gap-2">
                  <button onClick={() => act(iv._id, "approve")} disabled={busy === iv._id} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 rounded-lg text-sm disabled:opacity-50">{busy === iv._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve & activate</button>
                  <button onClick={() => act(iv._id, "reject")} disabled={busy === iv._id} className="flex items-center justify-center gap-1.5 bg-surface border border-card-border hover:bg-red-50 text-red-600 font-bold py-2.5 px-4 rounded-lg text-sm disabled:opacity-50"><X className="h-4 w-4" /> Reject</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-[90vh] max-w-full rounded-lg" />
          <a href={zoom} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="absolute top-4 right-4 flex items-center gap-1 text-white text-sm bg-white/10 px-3 py-1.5 rounded-lg"><ExternalLink className="h-4 w-4" /> Open</a>
        </div>
      )}
    </div>
  );
}

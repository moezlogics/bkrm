"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""}`,
});
const inputCls = "bg-surface-secondary border border-card-border rounded-xl px-4 py-2.5 text-sm outline-none text-content focus:border-primary w-full";

interface Faq { _id: string; question: string; answer: string; category: string; sequence: number; status: boolean; }

export default function AdminFaqPage() {
  const { toast } = useToast();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Faq> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/faqs", { headers: authH() });
      const json = await res.json();
      if (json.success) setFaqs(json.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!modal?.question || !modal?.answer) { toast.error("Question + answer required"); return; }
    setSaving(true);
    try {
      const editing = !!modal._id;
      const res = await fetch(editing ? `/api/admin/faqs/${modal._id}` : "/api/admin/faqs", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(modal),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); setModal(null); load(); } else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const del = async (f: Faq) => {
    if (!confirm("Delete this FAQ?")) return;
    const res = await fetch(`/api/admin/faqs/${f._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); load(); } else toast.error(json.message);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">FAQs</h1>
          <p className="text-xs text-content-secondary mt-1">Frequently asked questions (shown on /faq).</p>
        </div>
        <button onClick={() => setModal({ status: true, sequence: 0, category: "General" })}
          className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add FAQ
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : faqs.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center text-sm text-content-secondary">No FAQs yet.</div>
      ) : (
        <div className="bg-card border border-card-border rounded-2xl divide-y divide-card-border/60">
          {faqs.map((f) => (
            <div key={f._id} className="flex items-start gap-3 p-4">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-content text-sm">{f.question}</p>
                <p className="text-xs text-content-secondary line-clamp-2 mt-1">{f.answer}</p>
                <span className="text-[11px] text-content-tertiary">{f.category}{f.status ? "" : " · hidden"}</span>
              </div>
              <button onClick={() => setModal(f)} className="p-1.5 rounded-lg border border-card-border hover:bg-surface-secondary text-content-secondary"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => del(f)} className="p-1.5 rounded-lg border border-card-border hover:bg-danger/10 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <h2 className="font-bold text-content">{modal._id ? "Edit FAQ" : "Add FAQ"}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary"><X className="h-4.5 w-4.5 text-content-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">Question</label><input className={inputCls} value={modal.question || ""} onChange={(e) => setModal({ ...modal, question: e.target.value })} /></div>
              <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">Answer</label><textarea rows={4} className={`${inputCls} resize-none`} value={modal.answer || ""} onChange={(e) => setModal({ ...modal, answer: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">Category</label><input className={inputCls} value={modal.category || ""} onChange={(e) => setModal({ ...modal, category: e.target.value })} /></div>
                <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">Sequence</label><input type="number" className={inputCls} value={modal.sequence ?? 0} onChange={(e) => setModal({ ...modal, sequence: Number(e.target.value) })} /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 py-4 border-t border-card-border">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm font-medium border border-card-border rounded-xl hover:bg-surface-secondary text-content">Cancel</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

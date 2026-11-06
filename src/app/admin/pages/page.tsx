"use client";

import React, { useEffect, useState } from "react";
import { FileText, Plus, Pencil, Trash2, Loader2, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";

const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""}`,
});
const inputCls = "bg-surface-secondary border border-card-border rounded-xl px-4 py-2.5 text-sm outline-none text-content focus:border-primary w-full";

interface CmsPage {
  _id: string; title: string; slug: string; content: string;
  seoTitle?: string; seoDescription?: string; status: boolean; showInFooter: boolean; sequence: number;
}

export default function AdminPagesPage() {
  const { toast } = useToast();
  const [pages, setPages] = useState<CmsPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<CmsPage> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cms-pages", { headers: authH() });
      const json = await res.json();
      if (json.success) setPages(json.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!modal?.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const editing = !!modal._id;
      const res = await fetch(editing ? `/api/admin/cms-pages/${modal._id}` : "/api/admin/cms-pages", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(modal),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); setModal(null); load(); }
      else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const del = async (p: CmsPage) => {
    if (!confirm(`Delete page "${p.title}"?`)) return;
    const res = await fetch(`/api/admin/cms-pages/${p._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); load(); } else toast.error(json.message);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">CMS Pages</h1>
          <p className="text-xs text-content-secondary mt-1">About, Privacy, Terms aur baqi static pages.</p>
        </div>
        <button onClick={() => setModal({ status: true, showInFooter: true, sequence: 0 })}
          className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Page
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : pages.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center text-sm text-content-secondary">No pages yet. Create one with “Add Page”.</div>
      ) : (
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
              <th className="py-3 px-4">Title</th><th className="py-3 px-4">Slug</th><th className="py-3 px-4">Footer</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-card-border/50 text-content">
              {pages.map((p) => (
                <tr key={p._id} className="hover:bg-surface-secondary/30">
                  <td className="py-3 px-4 font-semibold">{p.title}</td>
                  <td className="py-3 px-4"><Link href={`/page/${p.slug}`} target="_blank" className="text-primary hover:underline inline-flex items-center gap-1 font-mono text-xs">/{p.slug}<ExternalLink className="h-3 w-3" /></Link></td>
                  <td className="py-3 px-4">{p.showInFooter ? <span className="text-emerald-600 text-xs font-bold">Yes</span> : <span className="text-content-tertiary text-xs">No</span>}</td>
                  <td className="py-3 px-4">{p.status ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-2 py-0.5 text-xs font-bold">Active</span> : <span className="bg-zinc-50 text-zinc-500 border border-zinc-200 rounded px-2 py-0.5 text-xs font-bold">Hidden</span>}</td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setModal(p)} className="p-1.5 rounded-lg border border-card-border hover:bg-surface-secondary text-content-secondary"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(p)} className="p-1.5 rounded-lg border border-card-border hover:bg-danger/10 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <h2 className="font-bold text-content">{modal._id ? "Edit Page" : "Add Page"}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary"><X className="h-4.5 w-4.5 text-content-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <Field label="Title *"><input className={inputCls} value={modal.title || ""} onChange={(e) => setModal({ ...modal, title: e.target.value })} /></Field>
              <Field label="Content (HTML)"><textarea rows={10} className={`${inputCls} font-mono text-xs`} value={modal.content || ""} onChange={(e) => setModal({ ...modal, content: e.target.value })} placeholder="<h2>Heading</h2><p>Paragraph…</p>" /></Field>
              <Field label="SEO Title"><input className={inputCls} value={modal.seoTitle || ""} onChange={(e) => setModal({ ...modal, seoTitle: e.target.value })} /></Field>
              <Field label="SEO Description"><textarea rows={2} className={inputCls} value={modal.seoDescription || ""} onChange={(e) => setModal({ ...modal, seoDescription: e.target.value })} /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Sequence"><input type="number" className={inputCls} value={modal.sequence ?? 0} onChange={(e) => setModal({ ...modal, sequence: Number(e.target.value) })} /></Field>
                <Toggle label="Active" value={!!modal.status} onChange={(v) => setModal({ ...modal, status: v })} />
                <Toggle label="In Footer" value={!!modal.showInFooter} onChange={(v) => setModal({ ...modal, showInFooter: v })} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">{label}</label>{children}</div>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-5">
      <span className="text-xs font-bold text-content uppercase tracking-wider">{label}</span>
      <button type="button" onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-surface-tertiary"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

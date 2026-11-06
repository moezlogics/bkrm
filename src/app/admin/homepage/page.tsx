"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X, LayoutGrid } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""}`,
});
const inputCls = "bg-surface-secondary border border-card-border rounded-xl px-4 py-2.5 text-sm outline-none text-content focus:border-primary w-full";

interface Section {
  _id: string; title: string; sequence: number; filter?: string; value?: string;
  style?: string; minPrice?: number; maxPrice?: number;
}

export default function AdminHomepagePage() {
  const { toast } = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [cats, setCats] = useState<{ name: string; slug: string }[]>([]);
  const [cities, setCities] = useState<{ name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Section> | null>(null);
  const [saving, setSaving] = useState(false);

  const flat = (nodes: any[], acc: any[] = []): any[] => {
    nodes.forEach((n) => { acc.push({ name: n.name, slug: n.slug }); if (n.children?.length) flat(n.children, acc); });
    return acc;
  };

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, ci] = await Promise.all([
        fetch("/api/admin/feature-sections", { headers: authH() }).then((r) => r.json()),
        fetch("/api/categories").then((r) => r.json()),
        fetch("/api/cities").then((r) => r.json()),
      ]);
      if (s.success) setSections(s.data);
      if (c.success) setCats(flat(c.data));
      if (ci.success) setCities(ci.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!modal?.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const editing = !!modal._id;
      const res = await fetch(editing ? `/api/admin/feature-sections/${modal._id}` : "/api/admin/feature-sections", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(modal),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); setModal(null); load(); } else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const del = async (s: Section) => {
    if (!confirm(`Delete section "${s.title}"?`)) return;
    const res = await fetch(`/api/admin/feature-sections/${s._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); load(); } else toast.error(json.message);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Homepage Builder</h1>
          <p className="text-xs text-content-secondary mt-1">Configure homepage listing rails (category/city/featured).</p>
        </div>
        <button onClick={() => setModal({ filter: "featured", sequence: sections.length, style: "grid" })}
          className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Section
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : sections.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center text-sm text-content-secondary">No sections yet. Add one with “Add Section”.</div>
      ) : (
        <div className="bg-card border border-card-border rounded-2xl divide-y divide-card-border/60">
          {sections.map((s) => (
            <div key={s._id} className="flex items-center gap-3 p-4">
              <LayoutGrid className="h-4 w-4 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-bold text-content text-sm">{s.title}</span>
                <span className="text-[11px] text-content-tertiary ml-2">
                  filter: {s.filter || "recent"}{s.value ? `=${s.value}` : ""} · seq {s.sequence}
                </span>
              </div>
              <button onClick={() => setModal(s)} className="p-1.5 rounded-lg border border-card-border hover:bg-surface-secondary text-content-secondary"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={() => del(s)} className="p-1.5 rounded-lg border border-card-border hover:bg-danger/10 text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModal(null)} />
          <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
              <h2 className="font-bold text-content">{modal._id ? "Edit Section" : "Add Section"}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary"><X className="h-4.5 w-4.5 text-content-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <F label="Section Title"><input className={inputCls} value={modal.title || ""} onChange={(e) => setModal({ ...modal, title: e.target.value })} placeholder="e.g. Cars in Multan" /></F>
              <F label="Filter Type">
                <select className={inputCls} value={modal.filter || "featured"} onChange={(e) => setModal({ ...modal, filter: e.target.value, value: "" })}>
                  <option value="featured">Featured / Boosted</option>
                  <option value="recent">Recent</option>
                  <option value="category">By Category</option>
                  <option value="city">By City</option>
                </select>
              </F>
              {modal.filter === "category" && (
                <F label="Category">
                  <select className={inputCls} value={modal.value || ""} onChange={(e) => setModal({ ...modal, value: e.target.value })}>
                    <option value="">Select category</option>
                    {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
                  </select>
                </F>
              )}
              {modal.filter === "city" && (
                <F label="City">
                  <select className={inputCls} value={modal.value || ""} onChange={(e) => setModal({ ...modal, value: e.target.value })}>
                    <option value="">Select city</option>
                    {cities.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
                  </select>
                </F>
              )}
              <div className="grid grid-cols-3 gap-3">
                <F label="Sequence"><input type="number" className={inputCls} value={modal.sequence ?? 0} onChange={(e) => setModal({ ...modal, sequence: Number(e.target.value) })} /></F>
                <F label="Min Price"><input type="number" className={inputCls} value={modal.minPrice ?? ""} onChange={(e) => setModal({ ...modal, minPrice: e.target.value as any })} /></F>
                <F label="Max Price"><input type="number" className={inputCls} value={modal.maxPrice ?? ""} onChange={(e) => setModal({ ...modal, maxPrice: e.target.value as any })} /></F>
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

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-1.5"><label className="text-xs font-bold text-content uppercase tracking-wider">{label}</label>{children}</div>;
}

"use client";

import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, X, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";

const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""}`,
});
const inputCls = "bg-surface-secondary border border-card-border rounded-xl px-4 py-2.5 text-sm outline-none text-content focus:border-primary w-full";

interface Post {
  _id: string; title: string; slug: string; excerpt?: string; content: string;
  coverImage?: string; category?: string; seoTitle?: string; seoDescription?: string; status: string;
}

export default function AdminBlogPage() {
  const { toast } = useToast();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Post> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/blog", { headers: authH() });
      const json = await res.json();
      if (json.success) setPosts(json.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!modal?.title) { toast.error("Title required"); return; }
    setSaving(true);
    try {
      const editing = !!modal._id;
      const res = await fetch(editing ? `/api/admin/blog/${modal._id}` : "/api/admin/blog", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(modal),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); setModal(null); load(); } else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const del = async (p: Post) => {
    if (!confirm(`Delete "${p.title}"?`)) return;
    const res = await fetch(`/api/admin/blog/${p._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); load(); } else toast.error(json.message);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Blog</h1>
          <p className="text-xs text-content-secondary mt-1">Guides and articles (shown on /blog).</p>
        </div>
        <button onClick={() => setModal({ status: "draft", category: "General" })}
          className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Post
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : posts.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center text-sm text-content-secondary">No posts yet.</div>
      ) : (
        <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead><tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
              <th className="py-3 px-4">Title</th><th className="py-3 px-4">Category</th><th className="py-3 px-4">Status</th><th className="py-3 px-4 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-card-border/50 text-content">
              {posts.map((p) => (
                <tr key={p._id} className="hover:bg-surface-secondary/30">
                  <td className="py-3 px-4 font-semibold">
                    <Link href={`/blog/${p.slug}`} target="_blank" className="hover:text-primary inline-flex items-center gap-1">{p.title}<ExternalLink className="h-3 w-3 opacity-50" /></Link>
                  </td>
                  <td className="py-3 px-4 text-content-secondary">{p.category}</td>
                  <td className="py-3 px-4">{p.status === "published"
                    ? <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-2 py-0.5 text-xs font-bold">Published</span>
                    : <span className="bg-amber-50 text-amber-600 border border-amber-200 rounded px-2 py-0.5 text-xs font-bold">Draft</span>}</td>
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
              <h2 className="font-bold text-content">{modal._id ? "Edit Post" : "Add Post"}</h2>
              <button onClick={() => setModal(null)} className="p-1.5 rounded-lg hover:bg-surface-secondary"><X className="h-4.5 w-4.5 text-content-secondary" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <F label="Title"><input className={inputCls} value={modal.title || ""} onChange={(e) => setModal({ ...modal, title: e.target.value })} /></F>
              <F label="Excerpt"><textarea rows={2} className={inputCls} value={modal.excerpt || ""} onChange={(e) => setModal({ ...modal, excerpt: e.target.value })} /></F>
              <F label="Content (HTML)"><textarea rows={8} className={`${inputCls} font-mono text-xs`} value={modal.content || ""} onChange={(e) => setModal({ ...modal, content: e.target.value })} /></F>
              <ImageField label="Cover image" value={modal.coverImage} onChange={(v) => setModal({ ...modal, coverImage: v })} folder="blog" admin aspect="wide" />
              <F label="Category"><input className={inputCls} value={modal.category || ""} onChange={(e) => setModal({ ...modal, category: e.target.value })} /></F>
              <F label="Status">
                <select className={inputCls} value={modal.status || "draft"} onChange={(e) => setModal({ ...modal, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </F>
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

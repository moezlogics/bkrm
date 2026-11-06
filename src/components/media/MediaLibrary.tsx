"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Search, Check, Loader2, Trash2, Copy, X, ImageOff, Info, Sparkles, Film, FileText } from "lucide-react";
import type { MediaItem } from "@/lib/media";
import { uploadImages, formatBytes } from "@/lib/upload-client";
import { useToast } from "@/components/ui/Toast";

const FOLDER_LABEL: Record<string, string> = {
  general: "General", listings: "Ad photos", profile: "Profile photos", shop: "Shop", branding: "Branding / logo",
  blog: "Blog", categories: "Categories", locations: "Locations", sliders: "Sliders", notifications: "Notifications",
  verification: "ID documents", payments: "Payment proofs",
};

/**
 * WordPress-style media library: upload (button or drag & drop), browse,
 * search, pick, edit title/alt, copy link, delete.
 * mode "select" is used inside MediaPicker; "manage" is the admin Media page.
 */
export function MediaLibrary({
  mode, multiple = false, folder = "general", admin = false, onSelect, onCancel, max,
}: {
  mode: "select" | "manage";
  multiple?: boolean;
  folder?: string;
  admin?: boolean;
  onSelect?: (items: MediaItem[]) => void;
  onCancel?: () => void;
  max?: number;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [storage, setStorage] = useState<{ files: number; bytes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<MediaItem[]>([]);
  const [detail, setDetail] = useState<MediaItem | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: number, append: boolean) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams({ page: String(p), limit: "40" });
      if (q.trim()) sp.set("q", q.trim());
      if (filter) sp.set("folder", filter);
      if (admin && mode === "manage") sp.set("private", "1");
      const r = await fetch(`/api/media?${sp}`);
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setItems((prev) => (append ? [...prev, ...j.data] : j.data));
      setPage(j.page); setPages(j.pages); setTotal(j.total);
      if (j.storage) setStorage(j.storage);
    } catch {
      toast.error("Couldn't load the media library");
    } finally {
      setLoading(false);
    }
  }, [q, filter, admin, mode, toast]);

  useEffect(() => {
    const t = setTimeout(() => load(1, false), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const doUpload = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name)
      || (admin && mode === "manage" && /^(video\/(mp4|webm|quicktime)|application\/pdf)$/.test(f.type)));
    if (!imgs.length) return toast.error(admin && mode === "manage" ? "Please choose images, videos or PDFs" : "Please choose image files");
    setProgress(0);
    try {
      const { items: up, failed } = await uploadImages(imgs.slice(0, 12), { folder: filter || folder, onProgress: setProgress });
      setItems((prev) => [...up, ...prev]);
      setTotal((t) => t + up.length);
      if (failed.length) toast.error(failed[0]);
      else toast.success(up.length > 1 ? `${up.length} images uploaded` : "Image uploaded");
      if (mode === "select") {
        // Newly uploaded images are what the user wants — select them straight away.
        setSelected((s) => (multiple ? [...up, ...s].slice(0, max || 99) : up.slice(0, 1)));
      }
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const toggle = (it: MediaItem) => {
    if (mode === "manage") return setDetail(it);
    setSelected((s) => {
      const on = s.some((x) => x.id === it.id);
      if (!multiple) return on ? [] : [it];
      if (on) return s.filter((x) => x.id !== it.id);
      if (max && s.length >= max) { toast.error(`You can choose up to ${max}`); return s; }
      return [...s, it];
    });
  };

  const remove = async (it: MediaItem, force = false) => {
    const r = await fetch(`/api/media/${it.id}${force ? "?force=1" : ""}`, { method: "DELETE" });
    const j = await r.json();
    if (j.code === "in-use") {
      if (confirm(`${j.message}\n\nDelete it anyway? Those places will show a missing image.`)) return remove(it, true);
      return;
    }
    if (!j.success) return toast.error(j.message || "Couldn't delete");
    setItems((p) => p.filter((x) => x.id !== it.id));
    setSelected((s) => s.filter((x) => x.id !== it.id));
    setTotal((t) => t - 1);
    setDetail(null);
    toast.success("Deleted");
  };

  const saveMeta = async (it: MediaItem, patch: { title?: string; alt?: string; caption?: string }) => {
    const r = await fetch(`/api/media/${it.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json();
    if (!j.success) return toast.error("Couldn't save");
    setItems((p) => p.map((x) => (x.id === it.id ? j.data : x)));
    setDetail(j.data);
    toast.success("Saved");
  };

  return (
    <div
      className="flex flex-col h-full min-h-0"
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); doUpload(Array.from(e.dataTransfer.files)); }}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={progress !== null}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold disabled:opacity-60"
        >
          {progress !== null ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Upload images"}
        </button>
        <input ref={fileRef} type="file" accept={admin && mode === "manage" ? "image/*,.heic,.heif,video/mp4,video/webm,video/quicktime,application/pdf" : "image/*,.heic,.heif"} multiple={multiple || mode === "manage"} hidden onChange={(e) => doUpload(Array.from(e.target.files || []))} />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="w-full h-10 pl-9 pr-3 rounded-lg border border-card-border bg-surface text-sm outline-none focus:border-primary" />
        </div>
        {admin && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="h-10 rounded-lg border border-card-border bg-surface px-3 text-sm outline-none focus:border-primary">
            <option value="">All folders</option>
            {Object.entries(FOLDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>
      {progress !== null && (
        <div className="h-1.5 rounded-full bg-surface-tertiary overflow-hidden mb-3">
          <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${Math.max(4, progress * 100)}%` }} />
        </div>
      )}
      <div className="flex items-center justify-between text-[11px] text-content-tertiary pb-2">
        <span>{total} image{total === 1 ? "" : "s"}{storage ? ` · ${formatBytes(storage.bytes)} used` : ""}</span>
        <span className="hidden sm:inline">Tip: drag & drop images anywhere here</span>
      </div>

      {/* Grid */}
      <div className={`relative flex-1 min-h-0 overflow-y-auto rounded-xl ${drag ? "ring-2 ring-primary ring-offset-2" : ""}`}>
        {drag && (
          <div className="absolute inset-0 z-10 grid place-items-center bg-primary/10 rounded-xl pointer-events-none">
            <span className="text-sm font-semibold text-primary">Drop to upload</span>
          </div>
        )}
        {!loading && items.length === 0 ? (
          <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-full min-h-[220px] rounded-xl border-2 border-dashed border-card-border grid place-items-center text-center p-8 hover:border-primary transition-colors">
            <span className="flex flex-col items-center gap-2">
              <Upload className="h-8 w-8 text-content-tertiary" />
              <span className="text-sm font-semibold text-content">{q ? "No images match your search" : "No images yet"}</span>
              <span className="text-xs text-content-secondary">Tap to upload from your phone or computer</span>
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {items.map((it) => {
              const idx = selected.findIndex((x) => x.id === it.id);
              return (
                <button
                  type="button"
                  key={it.id}
                  onClick={() => toggle(it)}
                  className={`group relative aspect-square rounded-lg overflow-hidden bg-surface-secondary border-2 transition-all ${idx >= 0 ? "border-primary" : "border-transparent hover:border-card-border"}`}
                  title={it.title || it.originalName}
                >
                  {it.kind === "video" || it.kind === "pdf" ? (
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-content-secondary p-2">
                      {it.kind === "video" ? <Film className="h-7 w-7" /> : <FileText className="h-7 w-7" />}
                      <span className="text-[10px] font-medium truncate max-w-full">{it.originalName || it.title}</span>
                    </span>
                  ) : (
                    <>
                      <ImageOff className="absolute inset-0 m-auto h-5 w-5 text-content-tertiary" />
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.thumbUrl} alt={it.alt || it.title} loading="lazy" style={it.color ? { backgroundColor: it.color } : undefined} className="relative h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                    </>
                  )}
                  {it.altSource === "ai" && <span className="absolute top-1 left-1 grid place-items-center h-5 w-5 rounded-full bg-white/90 text-primary" title="Alt text written by AI"><Sparkles className="h-3 w-3" /></span>}
                  {idx >= 0 && (
                    <span className="absolute top-1.5 right-1.5 grid place-items-center h-6 w-6 rounded-full bg-primary text-white text-[11px] font-bold shadow">
                      {multiple ? idx + 1 : <Check className="h-3.5 w-3.5" />}
                    </span>
                  )}
                  {it.isPrivate && <span className="absolute bottom-1 left-1 rounded bg-black/65 text-white text-[9px] font-semibold px-1.5 py-0.5">Private</span>}
                  {mode === "select" && (
                    <span onClick={(e) => { e.stopPropagation(); setDetail(it); }} className="absolute bottom-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-white/90 text-content-secondary opacity-0 group-hover:opacity-100 transition-opacity" role="button" aria-label="Details">
                      <Info className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              );
            })}
            {loading && Array.from({ length: items.length ? 6 : 12 }).map((_, i) => <div key={`s${i}`} className="aspect-square rounded-lg bg-surface-secondary animate-pulse" />)}
          </div>
        )}
        {!loading && page < pages && (
          <div className="flex justify-center py-4">
            <button type="button" onClick={() => load(page + 1, true)} className="h-9 px-5 rounded-lg border border-card-border text-sm font-semibold text-content-secondary hover:border-primary hover:text-primary">Load more</button>
          </div>
        )}
      </div>

      {/* Select footer */}
      {mode === "select" && (
        <div className="flex items-center gap-2 pt-3 mt-3 border-t border-card-border">
          <span className="text-xs text-content-secondary flex-1">{selected.length ? `${selected.length} selected` : multiple ? "Choose one or more images" : "Choose an image"}</span>
          <button type="button" onClick={onCancel} className="h-10 px-4 rounded-lg border border-card-border text-sm font-semibold text-content-secondary">Cancel</button>
          <button type="button" disabled={!selected.length} onClick={() => onSelect?.(selected)} className="h-10 px-5 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold disabled:opacity-50">
            {multiple && selected.length > 1 ? `Use ${selected.length} images` : "Use image"}
          </button>
        </div>
      )}

      {detail && <DetailPanel key={detail.id} item={detail} admin={admin} onClose={() => setDetail(null)} onDelete={() => remove(detail)} onSave={(p) => saveMeta(detail, p)}
        onUpdated={(it) => { setItems((p) => p.map((x) => (x.id === it.id ? it : x))); setDetail(it); }} />}
    </div>
  );
}

function DetailPanel({ item, admin, onClose, onDelete, onSave, onUpdated }: {
  item: MediaItem; admin: boolean; onClose: () => void; onDelete: () => void;
  onSave: (p: { title?: string; alt?: string; caption?: string }) => void; onUpdated: (it: MediaItem) => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [alt, setAlt] = useState(item.alt);
  const [caption, setCaption] = useState(item.caption);
  const [aiBusy, setAiBusy] = useState(false);
  const { toast } = useToast();
  const canAi = item.driver === "cdn" && item.kind === "image" && !item.isPrivate;
  const regenerate = async () => {
    setAiBusy(true);
    try {
      const r = await fetch(`/api/media/${item.id}/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setTitle(j.data.title); setAlt(j.data.alt); setCaption(j.data.caption);
      onUpdated(j.data);
      toast.success("AI wrote a new description");
    } catch (e: any) { toast.error(e.message || "The AI couldn't describe this image"); }
    finally { setAiBusy(false); }
  };
  const abs = typeof window !== "undefined" && item.url.startsWith("/") ? window.location.origin + item.url : item.url;
  const who = typeof item.uploadedBy === "object" ? item.uploadedBy.name : "";
  return (
    <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-card rounded-t-2xl sm:rounded-2xl border border-card-border flex flex-col sm:flex-row">
        <div className="sm:w-1/2 bg-surface-secondary grid place-items-center p-3 min-h-[220px]">
          {item.kind === "video" ? (
            <video src={item.url} controls preload="metadata" className="max-h-[50vh] w-full rounded-lg" />
          ) : item.kind === "pdf" ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-2 text-primary font-semibold text-sm"><FileText className="h-12 w-12" /> Open PDF</a>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.alt || item.title} className="max-h-[50vh] w-auto rounded-lg object-contain" />
          )}
        </div>
        <div className="sm:w-1/2 p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-content break-all">{item.originalName || item.title || "Image"}</h3>
            <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-surface-secondary" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            <dt className="text-content-tertiary">Dimensions</dt><dd className="text-content">{item.width} × {item.height}</dd>
            <dt className="text-content-tertiary">File size</dt><dd className="text-content">{formatBytes(item.sizeBytes)}</dd>
            <dt className="text-content-tertiary">Uploaded</dt><dd className="text-content">{new Date(item.createdAt).toLocaleDateString()}</dd>
            {admin && who && (<><dt className="text-content-tertiary">By</dt><dd className="text-content truncate">{who}</dd></>)}
            <dt className="text-content-tertiary">Folder</dt><dd className="text-content">{FOLDER_LABEL[item.folder] || item.folder}</dd>
            <dt className="text-content-tertiary">Stored on</dt><dd className="text-content">{item.driver === "cdn" ? "CDN" : "This server"}</dd>
          </dl>
          {!item.isPrivate && (
            <div className="flex items-center gap-2">
              <input readOnly value={abs} className="flex-1 min-w-0 h-9 rounded-lg border border-card-border bg-surface-secondary px-2.5 text-[11px] text-content-secondary" />
              <button type="button" onClick={() => { navigator.clipboard?.writeText(abs); toast.success("Link copied"); }} className="h-9 px-3 rounded-lg border border-card-border text-xs font-semibold inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" /> Copy</button>
            </div>
          )}
          <label className="text-xs font-semibold text-content-secondary">Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10 rounded-lg border border-card-border bg-surface px-3 text-sm outline-none focus:border-primary" />
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-semibold text-content-secondary">Alt text <span className="font-normal text-content-tertiary">(for Google &amp; screen readers)</span></label>
            {item.altSource === "ai" && alt === item.alt && <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary"><Sparkles className="h-3 w-3" /> AI</span>}
            {item.aiStatus === "pending" && <span className="text-[10px] text-content-tertiary">AI is writing…</span>}
          </div>
          <textarea value={alt} onChange={(e) => setAlt(e.target.value)} rows={2} className="rounded-lg border border-card-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
          <label className="text-xs font-semibold text-content-secondary">Caption</label>
          <input value={caption} onChange={(e) => setCaption(e.target.value)} className="h-10 rounded-lg border border-card-border bg-surface px-3 text-sm outline-none focus:border-primary" />
          {canAi && (
            <button type="button" onClick={regenerate} disabled={aiBusy} className="self-start inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-primary/30 bg-primary/5 text-primary text-xs font-semibold disabled:opacity-60">
              {aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} {item.altSource === "ai" ? "Rewrite with AI" : "Write with AI"}
            </button>
          )}
          <div className="flex items-center gap-2 pt-1 mt-auto">
            <button type="button" onClick={() => onSave({ title, alt, caption })} className="h-10 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-semibold">Save</button>
            <button type="button" onClick={() => { if (confirm("Delete this image permanently?")) onDelete(); }} className="h-10 px-4 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-semibold inline-flex items-center gap-1.5 ml-auto"><Trash2 className="h-4 w-4" /> Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

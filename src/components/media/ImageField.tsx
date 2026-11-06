"use client";

import React, { useRef, useState } from "react";
import { Upload, Images, X, Loader2, Link2 } from "lucide-react";
import { MediaPicker } from "./MediaPicker";
import { uploadImages } from "@/lib/upload-client";
import { useToast } from "@/components/ui/Toast";

/**
 * Image form control: upload straight from the device, pick from the media
 * library, or (secondary) paste a link. Replaces bare "Image URL" inputs.
 */
export function ImageField({
  value, onChange, label, folder = "general", admin = false, aspect = "wide", hint, allowUrl = true, className = "",
}: {
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
  folder?: string;
  admin?: boolean;
  aspect?: "wide" | "square" | "logo" | "banner";
  hint?: string;
  allowUrl?: boolean;
  className?: string;
}) {
  const { toast } = useToast();
  const [picker, setPicker] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [urlMode, setUrlMode] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const box = { wide: "aspect-[16/9]", square: "aspect-square w-40", logo: "h-28", banner: "aspect-[3/1]" }[aspect];

  const upload = async (file?: File) => {
    if (!file) return;
    setProgress(0);
    try {
      const { items } = await uploadImages([file], { folder, onProgress: setProgress, context: label });
      if (items[0]) onChange(items[0].url);
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">{label}</span>}
      <div
        className={`relative ${box} max-w-full rounded-xl border-2 border-dashed ${value ? "border-card-border" : "border-card-border hover:border-primary"} bg-surface-secondary overflow-hidden grid place-items-center transition-colors`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
      >
        {value ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className={`h-full w-full ${aspect === "logo" ? "object-contain p-3" : "object-cover"}`} />
            <button type="button" onClick={() => onChange("")} className="absolute top-2 right-2 grid place-items-center h-7 w-7 rounded-full bg-black/60 text-white hover:bg-black/80" aria-label="Remove image">
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-col items-center gap-1.5 p-4 text-center">
            {progress !== null ? <Loader2 className="h-6 w-6 animate-spin text-primary" /> : <Upload className="h-6 w-6 text-content-tertiary" />}
            <span className="text-xs font-semibold text-content-secondary">{progress !== null ? `Uploading ${Math.round(progress * 100)}%` : "Tap to upload or drop an image"}</span>
          </button>
        )}
        {progress !== null && value && (
          <div className="absolute inset-0 bg-black/40 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={progress !== null} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-card-border bg-surface text-xs font-semibold text-content hover:border-primary hover:text-primary disabled:opacity-60">
          <Upload className="h-3.5 w-3.5" /> {value ? "Replace" : "Upload"}
        </button>
        <button type="button" onClick={() => setPicker(true)} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-card-border bg-surface text-xs font-semibold text-content hover:border-primary hover:text-primary">
          <Images className="h-3.5 w-3.5" /> Media library
        </button>
        {allowUrl && (
          <button type="button" onClick={() => setUrlMode((v) => !v)} className="inline-flex items-center gap-1 h-8 px-2 text-[12px] font-semibold text-content-tertiary hover:text-primary">
            <Link2 className="h-3.5 w-3.5" /> {urlMode ? "Hide link" : "Use a link"}
          </button>
        )}
      </div>
      {urlMode && (
        <input value={value || ""} onChange={(e) => onChange(e.target.value.trim())} placeholder="https://…" className="h-9 rounded-lg border border-card-border bg-surface px-3 text-xs outline-none focus:border-primary" />
      )}
      {hint && <p className="text-[12px] text-content-tertiary">{hint}</p>}
      <input ref={fileRef} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => upload(e.target.files?.[0])} />
      <MediaPicker open={picker} onClose={() => setPicker(false)} folder={folder} admin={admin} onSelect={(items) => items[0] && onChange(items[0].url)} />
    </div>
  );
}

"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";
import type { MediaItem } from "@/lib/media";
import { MediaLibrary } from "./MediaLibrary";

/** Full-screen (phone) / large (desktop) media-library picker. */
export function MediaPicker({
  open, onClose, onSelect, multiple = false, folder = "general", admin = false, title, max,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (items: MediaItem[]) => void;
  multiple?: boolean;
  folder?: string;
  admin?: boolean;
  title?: string;
  max?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full sm:max-w-5xl h-[92dvh] sm:h-[85vh] bg-card sm:rounded-2xl rounded-t-2xl border border-card-border flex flex-col p-4">
        <div className="flex items-center justify-between pb-3">
          <h2 className="text-base font-semibold text-content">{title || (multiple ? "Choose images" : "Choose an image")}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-surface-secondary" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 min-h-0">
          <MediaLibrary
            mode="select"
            multiple={multiple}
            folder={folder}
            admin={admin}
            max={max}
            onCancel={onClose}
            onSelect={(items) => { onSelect(items); onClose(); }}
          />
        </div>
      </div>
    </div>
  );
}

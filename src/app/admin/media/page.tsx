"use client";

import React from "react";
import { MediaLibrary } from "@/components/media/MediaLibrary";

export default function AdminMediaPage() {
  return (
    <div className="flex flex-col gap-4 h-[calc(100dvh-7rem)]">
      <div>
        <h1 className="text-2xl font-bold text-content tracking-tight">Media Library</h1>
        <p className="text-xs text-content-secondary mt-1">
          Every image uploaded on the site — logos, sliders, blog covers, ad photos and ID documents (private). Upload, search, re-use, caption or delete.
        </p>
      </div>
      <div className="flex-1 min-h-0 bg-card border border-card-border rounded-2xl p-4">
        <MediaLibrary mode="manage" admin folder="general" />
      </div>
    </div>
  );
}

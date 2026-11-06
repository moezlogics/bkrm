"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/** Shown while the sample ads from first-run setup are still live. */
export function RemoveDemo({ count }: { count: number }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const remove = async () => {
    if (!window.confirm(`Remove the ${count} demo ads and the demo seller accounts? Real ads are not touched.`)) return;
    setBusy(true);
    try {
      const r = await fetch("/api/admin/demo", { method: "DELETE" });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(`Removed ${j.removed} demo ads`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message || "Couldn't remove the demo ads");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
      <Sparkles className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-sm text-amber-900 flex-1">
        <b>{count} demo {count === 1 ? "ad is" : "ads are"} live</b> — added at setup to show how the site looks. Remove them before you launch.
      </p>
      <button onClick={remove} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Remove demo data
      </button>
    </div>
  );
}

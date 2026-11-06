"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Buying / Selling account type. Selling unlocks the seller tools (my ads,
 * plans, shop, verification); posting an ad switches automatically too.
 */
export function AccountModeSwitch({ isSeller }: { isSeller: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [mode, setMode] = useState<"buyer" | "seller">(isSeller ? "seller" : "buyer");
  const [busy, setBusy] = useState(false);

  const change = async (next: "buyer" | "seller") => {
    if (next === mode || busy) return;
    setBusy(true);
    const prev = mode;
    setMode(next);
    try {
      const r = await fetch("/api/auth/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: next }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(next === "seller" ? "Seller account on — verify with your CNIC to get the verified seller badge" : "Switched to a buying account");
      router.refresh();
    } catch {
      setMode(prev);
      toast.error("Couldn't switch account type");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-card shadow-sm ring-1 ring-black/[0.03] p-3">
      <div className="flex items-center justify-between px-1 pb-2">
        <span className="text-[14px] font-semibold text-content">Account type</span>
        {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-secondary p-1" role="radiogroup" aria-label="Account type">
        {(["buyer", "seller"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => change(m)}
            className={`h-10 rounded-lg text-sm font-semibold transition-all ${mode === m ? "bg-card text-primary shadow-sm" : "text-content-secondary"}`}
          >
            {m === "buyer" ? "Buying" : "Selling"}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-content-tertiary px-1 pt-2">
        {mode === "seller" ? "You can post ads, boost them, open a shop and get the Verified seller badge." : "Switch to Selling any time to post ads — posting an ad switches you automatically."}
      </p>
    </div>
  );
}

"use client";

import React, { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Flag, X, Loader2, Check } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { loginUrl, useResumeIntent } from "@/lib/auth-intent";

// Ad reasons come from Admin → Reports (GET /api/reports); these are the fallback.
const REASONS: Record<string, string[]> = {
  listing: ["Spam or misleading ad", "Already sold", "Fraud / asks for advance payment", "Stolen or without documents", "Wrong category / make", "Duplicate ad", "Offensive content"],
  seller: ["Scammer / fraud", "Fake profile", "Rude / abusive", "Sells stolen goods or fake documents", "Spam / repeated ads"],
};
let adminReasons: Promise<string[]> | null = null;
const loadReasons = () =>
  (adminReasons ||= fetch("/api/reports").then((r) => r.json()).then((j) => (j.success && j.data?.length ? j.data : [])).catch(() => []));

export function ReportButton({
  type, itemId, reportedUserId, className, label = "Report",
}: { type: "listing" | "seller"; itemId?: string; reportedUserId?: string; className?: string; label?: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [listingReasons, setListingReasons] = useState<string[] | null>(null);
  const reasons = type === "listing" ? listingReasons || REASONS.listing : REASONS.seller;

  useEffect(() => {
    if (open && type === "listing" && !listingReasons) loadReasons().then((r) => r.length && setListingReasons(r));
  }, [open, type, listingReasons]);

  const trigger = () => {
    // Come back to this exact page and reopen the report form after login.
    if (!session) { router.push(loginUrl(pathname, "report")); return; }
    setOpen(true);
  };

  useResumeIntent({ report: () => setOpen(true) }, !!session);

  const submit = async () => {
    if (!reason) { toast.error("Please choose a reason"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, itemId, reportedUserId, reason, message }),
      });
      const j = await r.json();
      if (j.success) { setDone(true); toast.success(j.message); setTimeout(() => { setOpen(false); setDone(false); setReason(""); setMessage(""); }, 1200); }
      else toast.error(j.message || "Couldn't send the report");
    } catch { toast.error("Couldn't send the report"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button onClick={trigger} className={className || "inline-flex items-center gap-1.5 text-xs font-semibold text-content-tertiary hover:text-danger transition-colors"}>
        <Flag className="h-3.5 w-3.5" /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => !busy && setOpen(false)} />
          <div className="relative z-10 w-full sm:max-w-md bg-card border-t sm:border border-card-border rounded-t-2xl sm:rounded-xl p-5 flex flex-col gap-3 shadow-xl animate-slide-up">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-content flex items-center gap-2"><Flag className="h-4 w-4 text-danger" /> Report {type === "seller" ? "seller" : "ad"}</h3>
              <button onClick={() => !busy && setOpen(false)} className="p-1.5 rounded-lg hover:bg-surface-secondary text-content-secondary"><X className="h-5 w-5" /></button>
            </div>
            {done ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <div className="h-12 w-12 rounded-lg bg-emerald-50 grid place-items-center"><Check className="h-6 w-6 text-emerald-600" /></div>
                <p className="text-sm font-semibold text-content">Report submitted. Thank you!</p>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  {reasons.map((r) => (
                    <button key={r} onClick={() => setReason(r)} className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${reason === r ? "border-primary bg-primary/5 text-content font-semibold" : "border-card-border text-content-secondary hover:border-content-tertiary"}`}>
                      {r}
                    </button>
                  ))}
                </div>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} placeholder="Details (optional)…" className="rounded-lg border border-card-border p-2.5 text-sm outline-none focus:border-primary bg-surface resize-none" />
                <button onClick={submit} disabled={busy || !reason} className="h-11 rounded-lg bg-danger text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Submit report"}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

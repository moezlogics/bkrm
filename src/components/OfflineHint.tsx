"use client";

import React from "react";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/components/NetworkStatus";

/** On the 404 page: if the visitor is offline, the page may well exist — say so. */
export function OfflineHint() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-[14px] font-semibold text-white">
      <WifiOff className="h-4 w-4" /> You&apos;re offline — this page might exist. Reconnect and{" "}
      <button onClick={() => window.location.reload()} className="underline underline-offset-2">try again</button>.
    </div>
  );
}

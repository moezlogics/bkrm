"use client";

import React, { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";

/** true while the browser reports a connection (SSR: assume online). */
export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

/**
 * Site-wide connection notice: a slim bar while offline ("we'll reconnect by
 * ourselves"), a short "Back online" when the connection returns — so a page
 * that won't load isn't mistaken for a broken site.
 */
export function NetworkStatus() {
  const online = useOnline();
  const [back, setBack] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!online) { setWasOffline(true); return; }
    if (!wasOffline) return;
    setBack(true);
    const t = setTimeout(() => { setBack(false); setWasOffline(false); }, 3000);
    return () => clearTimeout(t);
  }, [online, wasOffline]);

  if (online && !back) return null;
  return (
    <div role="status" aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[95] flex items-center justify-center gap-2 px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-[13px] font-semibold text-white shadow-md ${online ? "bg-emerald-600" : "bg-slate-900"}`}>
      {online ? <><Wifi className="h-4 w-4" /> Back online</> : <><WifiOff className="h-4 w-4" /> You&apos;re offline — we&apos;ll reconnect automatically</>}
    </div>
  );
}

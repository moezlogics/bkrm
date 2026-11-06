"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { WifiOff, RotateCcw, Home, AlertTriangle } from "lucide-react";
import { useOnline } from "@/components/NetworkStatus";

/**
 * A page failed to load or crashed. Offline → says so and retries by itself
 * the moment the connection is back; otherwise a plain "try again".
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const online = useOnline();

  useEffect(() => { console.error(error); }, [error]);
  // Came back online → try the page again.
  useEffect(() => {
    const retry = () => reset();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [reset]);

  return (
    <div className="wrap py-14 sm:py-20 pb-mobile-nav">
      <div className="mx-auto max-w-md text-center">
        <span className={`mx-auto grid place-items-center h-16 w-16 rounded-2xl ${online ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-600"}`}>
          {online ? <AlertTriangle className="h-8 w-8" /> : <WifiOff className="h-8 w-8" />}
        </span>
        <h1 className="mt-5 text-2xl font-bold text-content">{online ? "Something went wrong" : "You're offline"}</h1>
        <p className="mt-2 text-sm text-content-secondary">
          {online
            ? "This page didn't load properly. It's usually temporary — please try again."
            : "Check your Wi-Fi or mobile data. This page will reload by itself as soon as you're back online."}
        </p>
        <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
          <button onClick={() => reset()} className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold">
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
          <Link href="/" className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] text-sm font-semibold text-content hover:border-primary">
            <Home className="h-4 w-4" /> Go to the homepage
          </Link>
        </div>
        {online && error.digest && <p className="mt-6 text-[12px] text-content-tertiary">Error reference: {error.digest}</p>}
      </div>
    </div>
  );
}

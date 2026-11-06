"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2, Eye, EyeOff, MailCheck } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

const input = "h-11 w-full rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface";

function Inner({ brand }: { brand?: React.ReactNode }) {
  const params = useSearchParams();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(params.get("email") || "");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setStep("code");
      setMsg({ tone: "ok", text: j.devCode ? `${j.message} (Test mode — code: ${j.devCode})` : j.message });
    } catch (err: any) { setMsg({ tone: "err", text: err.message || "Couldn't send the code" }); }
    finally { setBusy(false); }
  };

  const reset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/auth/forgot-password", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, code, newPassword: pw }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      window.location.assign(withBasePath("/login?reset=1"));
    } catch (err: any) { setMsg({ tone: "err", text: err.message || "Couldn't reset the password" }); setBusy(false); }
  };

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] flex items-center justify-center bg-surface-secondary px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {brand && <div className="mb-4 flex justify-center">{brand}</div>}
          <h1 className="text-xl font-bold text-content">{step === "email" ? "Forgot your password?" : "Set a new password"}</h1>
          <p className="text-sm text-content-secondary mt-1">{step === "email" ? "We'll email you a 6-digit code to reset it." : `Enter the code we sent to ${email}.`}</p>
        </div>
        <div className="bg-card border border-card-border rounded-xl p-6 shadow-xs">
          {msg && (
            <div role="status" className={`mb-4 rounded-lg px-3 py-2.5 text-[14px] font-medium ${msg.tone === "ok" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-danger/25 bg-danger/5 text-danger"}`}>
              {msg.tone === "ok" && <MailCheck className="inline h-4 w-4 mr-1 -mt-0.5" />}{msg.text}
            </div>
          )}
          {step === "email" ? (
            <form onSubmit={sendCode} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-content">Email</span>
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className={input} />
              </label>
              <button type="submit" disabled={busy} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Send code
              </button>
            </form>
          ) : (
            <form onSubmit={reset} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-content">6-digit code</span>
                <input inputMode="numeric" autoComplete="one-time-code" required maxLength={14} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="••••••" className={`${input} tracking-[0.4em] text-center text-lg`} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-content">New password</span>
                <span className="relative">
                  <input type={show ? "text" : "password"} required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" className={`${input} pr-11`} />
                  <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-content-tertiary" aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                </span>
              </label>
              <button type="submit" disabled={busy || code.length !== 6 || pw.length < 8} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
              </button>
              <button type="button" onClick={() => sendCode()} disabled={busy} className="text-[14px] font-semibold text-primary">Send a new code</button>
            </form>
          )}
        </div>
        <p className="text-center text-sm text-content-secondary mt-5">
          Remembered it? <Link href="/login" className="font-bold text-primary hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export function ResetForm({ brand }: { brand?: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><Inner brand={brand} /></Suspense>;
}

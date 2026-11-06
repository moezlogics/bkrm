"use client";

import React, { useState } from "react";
import { signIn } from "next-auth/react";
import { ShieldCheck, Lock, Mail, Loader2, Eye, EyeOff, AlertCircle, ArrowLeft, ClipboardList, Users, Settings2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

/**
 * Admin sign-in. Uses the admin-only credentials provider (lib/auth): other
 * accounts are refused like a wrong password, attempts are rate-limited per
 * IP and account, and each successful sign-in is emailed to the admin.
 */
export function AdminLoginForm({ siteName, logo, color }: { siteName: string; logo: string; color: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [trap, setTrap] = useState(""); // honeypot
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!email.trim() || !password) { setError("Enter your admin email and password."); return; }
    setLoading(true);
    try {
      const res: any = await signIn("admin-credentials", {
        email: email.trim().toLowerCase(), password, website: trap,
        redirect: false, redirectTo: withBasePath("/admin"),
      });
      if (res?.error) {
        setError(res.code === "rate_limited"
          ? "Too many failed attempts. For security, sign-in is paused for a while — please try again later."
          : "Wrong email or password.");
        setPassword("");
        return;
      }
      window.location.assign(withBasePath("/admin"));
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => setCaps(e.getModifierState?.("CapsLock") ?? false);
  const field = "flex items-center gap-2.5 h-12 rounded-xl border border-slate-300 bg-white px-3.5 focus-within:border-[var(--admin-c)] focus-within:ring-4 focus-within:ring-[color-mix(in_srgb,var(--admin-c)_15%,transparent)] transition";

  return (
    <div className="min-h-dvh grid lg:grid-cols-[1fr_1fr] bg-slate-50 text-slate-900" style={{ ["--admin-c" as any]: color }}>
      {/* Brand side (desktop) */}
      <aside className="hidden lg:flex flex-col justify-between p-12 text-white relative overflow-hidden" style={{ background: `linear-gradient(145deg, ${color}, color-mix(in srgb, ${color} 55%, black))` }}>
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -left-16 bottom-10 h-56 w-56 rounded-full bg-white/5" aria-hidden />
        <div className="relative flex items-center gap-3">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={siteName} className="h-9 w-auto max-w-[200px] object-contain brightness-0 invert" />
          ) : <span className="text-2xl font-bold tracking-tight">{siteName}</span>}
        </div>
        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight text-white">Admin console</h2>
          <p className="mt-3 text-white/80">Everything that keeps {siteName} running, in one place.</p>
          <ul className="mt-8 flex flex-col gap-4 text-sm">
            <li className="flex items-center gap-3"><span className="grid place-items-center h-9 w-9 rounded-lg bg-white/15"><ClipboardList className="h-4.5 w-4.5" /></span> Review listings and reports</li>
            <li className="flex items-center gap-3"><span className="grid place-items-center h-9 w-9 rounded-lg bg-white/15"><Users className="h-4.5 w-4.5" /></span> Verify sellers and manage users</li>
            <li className="flex items-center gap-3"><span className="grid place-items-center h-9 w-9 rounded-lg bg-white/15"><Settings2 className="h-4.5 w-4.5" /></span> Branding, settings and notifications</li>
          </ul>
        </div>
        <p className="relative text-xs text-white/60 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Protected area · sign-ins are rate-limited and logged</p>
      </aside>

      {/* Form side */}
      <main className="flex flex-col items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8 flex justify-center">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt={siteName} className="h-9 w-auto max-w-[200px] object-contain" />
            ) : <span className="text-2xl font-bold tracking-tight" style={{ color }}>{siteName}</span>}
          </div>

          <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_10px_40px_rgba(15,23,42,0.08)] p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="grid place-items-center h-11 w-11 rounded-xl text-white shrink-0" style={{ background: color }}><ShieldCheck className="h-5.5 w-5.5" /></span>
              <div>
                <h1 className="text-xl font-bold leading-tight">Admin sign-in</h1>
                <p className="text-[14px] text-slate-500">For site administrators only.</p>
              </div>
            </div>

            {error && (
              <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[14px] font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" /> <span>{error}</span>
              </div>
            )}

            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-email" className="text-[14px] font-semibold text-slate-700">Email</label>
                <div className={field}>
                  <Mail className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                  <input id="admin-email" type="email" autoComplete="username" inputMode="email" autoFocus required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="admin-password" className="text-[14px] font-semibold text-slate-700">Password</label>
                <div className={field}>
                  <Lock className="h-4.5 w-4.5 text-slate-400 shrink-0" />
                  <input id="admin-password" type={show ? "text" : "password"} autoComplete="current-password" required value={password}
                    onChange={(e) => setPassword(e.target.value)} onKeyUp={onKey} onKeyDown={onKey} placeholder="••••••••" className="flex-1 min-w-0 bg-transparent outline-none text-[15px]" />
                  <button type="button" onClick={() => setShow((s) => !s)} className="text-slate-400 hover:text-slate-700 p-1" aria-label={show ? "Hide password" : "Show password"}>
                    {show ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
                {caps && <p className="text-[13px] font-medium text-amber-700">Caps Lock is on</p>}
              </div>

              {/* Honeypot: hidden from people and screen readers; bots fill it in. */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" />

              <button type="submit" disabled={loading} className="mt-1 h-12 rounded-xl text-white font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 transition hover:brightness-110" style={{ background: color }}>
                {loading ? <><Loader2 className="h-4.5 w-4.5 animate-spin" /> Signing in…</> : "Sign in"}
              </button>
            </form>

            <p className="mt-5 text-[13px] leading-relaxed text-slate-500 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-px text-emerald-600" />
              Failed attempts are limited, and every admin sign-in is emailed to the account owner.
            </p>
          </div>

          <a href={withBasePath("/")} className="mt-6 inline-flex items-center gap-1.5 text-[14px] font-semibold text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" /> Back to {siteName}
          </a>
        </div>
      </main>
    </div>
  );
}

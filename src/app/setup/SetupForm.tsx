"use client";

import React, { useState } from "react";
import { Loader2, Eye, EyeOff, AlertCircle, CheckCircle2, Store, UserCog, Sparkles, KeyRound, ArrowRight, Database } from "lucide-react";
import { iconFor, type SpecIconKey } from "@/vertical/icons";
import { withBasePath } from "@/lib/base-path";
import { VERTICAL } from "@/vertical";

type V = { id: string; many: string; One: string; defaultName: string; icon: SpecIconKey };
type Stats = { categories: number; fields: number; cities: number; demoAds: number; listings?: number; sellers?: number; fromBundle?: boolean };
type BundleInfo = { siteName: string | null; counts: Record<string, number>; cdnMissing?: boolean } | null;

/**
 * First-run setup: the owner names the site and creates the admin account;
 * the server then builds the catalogue — from seed/bundle.json when one was
 * uploaded (then deleted), else the vertical's built-in one (lib/setup).
 */
export function SetupForm({ vertical, needsKey, bundle = null }: { vertical: V; needsKey: boolean; bundle?: BundleInfo }) {
  const [f, setF] = useState({ siteName: vertical.defaultName, contactPhone: "", adminName: "", adminEmail: "", adminPassword: "", confirm: "", setupKey: "", demo: !bundle });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; message: string } | null>(null);
  const [done, setDone] = useState<Stats | null>(null);
  const Icon = iconFor(vertical.icon);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (f.adminPassword !== f.confirm) { setErr({ field: "confirm", message: "Passwords don't match." }); return; }
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch(withBasePath("/api/setup"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, confirm: undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) { setErr({ field: j.field, message: j.message || "Setup failed." }); return; }
      setDone(j.stats);
    } catch {
      setErr({ message: "We couldn't reach the server. Check that it's running, then try again." });
    } finally {
      setBusy(false);
    }
  };

  const input = (bad: boolean) =>
    `w-full h-11 rounded-xl border ${bad ? "border-red-400 ring-4 ring-red-100" : "border-slate-300 focus:border-primary focus:ring-4 focus:ring-primary/15"} bg-white px-3.5 text-[15px] outline-none transition`;
  const bad = (k: string) => err?.field === k;

  if (done) {
    return (
      <div className="min-h-dvh grid place-items-center bg-slate-50 px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-3 text-xl font-bold text-slate-900">{f.siteName} is ready</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            {done.categories} categories, {done.fields} spec fields and {done.cities} cities are set up
            {done.demoAds ? `, with ${done.demoAds} demo ads to show how it looks (remove them anytime from the admin dashboard)` : ""}.
          </p>
          {done.fromBundle && (
            <p className="mt-2 text-xs text-slate-500">
              {done.listings ? `${done.listings} ads from ${done.sellers} sellers were loaded with their photos. ` : ""}The seed file has been deleted from the server.
            </p>
          )}
          <div className="mt-6 flex flex-col gap-2.5">
            <a href={withBasePath("/newlogin")} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition">
              Sign in to the admin panel <ArrowRight className="h-4 w-4" />
            </a>
            <a href={withBasePath("/")} className="inline-flex items-center justify-center h-11 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition">View the site</a>
          </div>
          <p className="mt-5 text-xs text-slate-500">Next: Admin → Settings for your logo, colours, payment details and email (SMTP).</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <div className="bg-gradient-to-br from-primary to-primary-dark text-white">
        <div className="max-w-2xl mx-auto px-4 pt-10 pb-16">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center h-11 w-11 rounded-xl bg-white/15"><Icon className="h-6 w-6" /></span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">First-time setup</p>
              <h1 className="text-2xl font-bold leading-tight text-white">Set up your {vertical.many} marketplace</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-white/80 max-w-lg">
            Two minutes: name your site and create the admin account. {VERTICAL.copy.catalogue || `${vertical.One} makes and models`}, specs, Pakistan&apos;s cities, plans and help pages are added for you. You can edit all of it later.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="max-w-2xl mx-auto px-4 -mt-10 pb-16 flex flex-col gap-4" noValidate>
        {bundle && (
          <Card icon={Database} title="Seed file found">
            <p className="text-sm text-slate-700">
              This server has a seed file. Setup loads it: {bundle.counts.categories} categories, {bundle.counts.customfields} spec fields,{" "}
              {bundle.counts.cities} cities with {bundle.counts.areas} areas, {bundle.counts.cmspages} pages, {bundle.counts.faqs} FAQs, {bundle.counts.blogposts} blog posts and {bundle.counts.packages} plans.
            </p>
            {bundle.counts.listings ? (
              <p className="text-sm text-slate-700">
                It also has <b>{bundle.counts.listings} ads</b> from {bundle.counts.users} sellers with {bundle.counts.media} photos. The photos are in the CDN&apos;s data folder.
              </p>
            ) : (
              <p className="text-xs text-slate-500">No users or ads are in it.</p>
            )}
            <p className="text-xs text-slate-500">The file is deleted as soon as setup finishes.</p>
            {bundle.cdnMissing && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                Set <b className="font-mono">NEXT_PUBLIC_CDN_URL</b> (your CDN&apos;s address) in this site&apos;s .env and restart before running setup — the photos are served from there.
              </p>
            )}
          </Card>
        )}
        <Card icon={Store} title="Your marketplace">
          <Field label="Site name" hint="Shown in the header, emails and search results.">
            <input value={f.siteName} onChange={set("siteName")} maxLength={60} required className={input(bad("siteName"))} />
          </Field>
          <Field label="Support phone" hint="Optional — shown in the footer and used for WhatsApp.">
            <input value={f.contactPhone} onChange={set("contactPhone")} inputMode="tel" placeholder="03XX XXXXXXX" className={input(bad("contactPhone"))} />
          </Field>
        </Card>

        <Card icon={UserCog} title="Admin account">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Your name"><input value={f.adminName} onChange={set("adminName")} autoComplete="name" required className={input(bad("adminName"))} /></Field>
            <Field label="Email"><input type="email" value={f.adminEmail} onChange={set("adminEmail")} autoComplete="email" required className={input(bad("adminEmail"))} /></Field>
            <Field label="Password" hint="At least 10 characters.">
              <div className="relative">
                <input type={show ? "text" : "password"} value={f.adminPassword} onChange={set("adminPassword")} autoComplete="new-password" required className={`${input(bad("adminPassword"))} pr-11`} />
                <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center h-8 w-8 rounded-lg text-slate-500 hover:bg-slate-100" aria-label={show ? "Hide password" : "Show password"}>
                  {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </Field>
            <Field label="Confirm password"><input type={show ? "text" : "password"} value={f.confirm} onChange={set("confirm")} autoComplete="new-password" required className={input(bad("confirm"))} /></Field>
          </div>
          <p className="text-xs text-slate-500">You&apos;ll sign in at <b className="font-mono">/newlogin</b>. Admin sign-ins are rate-limited and each one is emailed to you.</p>
        </Card>

        <Card icon={Sparkles} title="Demo content">
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={f.demo} onChange={set("demo")} className="mt-1 h-4 w-4 accent-[var(--primary)]" />
            <span className="text-sm text-slate-700">
              Add about a dozen sample {vertical.many} ads so you can see how the site looks.
              <span className="block text-xs text-slate-500 mt-0.5">They&apos;re marked as demo and can be removed in one click from the admin dashboard.</span>
            </span>
          </label>
        </Card>

        {needsKey && (
          <Card icon={KeyRound} title="Setup key">
            <Field label="SETUP_KEY" hint="The value of SETUP_KEY in the server's .env file — it proves you own this server.">
              <input value={f.setupKey} onChange={set("setupKey")} autoComplete="off" spellCheck={false} className={`${input(bad("setupKey"))} font-mono`} />
            </Field>
          </Card>
        )}

        {err && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /> {err.message}
          </p>
        )}

        <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-white font-bold text-[15px] hover:bg-primary-dark disabled:opacity-60 transition shadow-sm">
          {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting up — this takes a few seconds…</> : <>Create my marketplace <ArrowRight className="h-4 w-4" /></>}
        </button>
      </form>
    </div>
  );
}

function Card({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm flex flex-col gap-4">
      <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-900"><Icon className="h-4.5 w-4.5 text-primary" /> {title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[14px] font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

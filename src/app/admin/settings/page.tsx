"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Palette, Settings as SettingsIcon, Home, Share2, Phone, ListChecks, Search as SeoIcon, Code2, Save, Loader2, Mail, Send, CheckCircle2, XCircle, Bell } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";

type Field =
  | { key: string; label: string; type?: "text" | "number" | "textarea" | "url" | "code"; placeholder?: string; hint?: string; full?: boolean };
type Tab = { id: string; title: string; description: string; icon: React.ElementType; fields?: Field[] };

const TABS: Tab[] = [
  { id: "branding", title: "Branding & Appearance", description: "Logo, favicon and brand colour — applied across the whole site.", icon: Palette },
  {
    id: "general", title: "General", description: "Site name, currency and default location.", icon: SettingsIcon,
    fields: [
      { key: "site_name", label: "Site name", hint: "Shown in the browser tab, emails and as the text logo when no logo image is set." },
      { key: "site_tagline", label: "Tagline" },
      { key: "default_currency", label: "Currency code" },
      { key: "currency_symbol", label: "Currency symbol" },
      { key: "default_country", label: "Default country" },
      { key: "default_city", label: "Default city" },
    ],
  },
  {
    id: "homepage", title: "Homepage", description: "Hero text and search box on the storefront.", icon: Home,
    fields: [
      { key: "hero_title", label: "Hero title", full: true },
      { key: "hero_subtitle", label: "Hero subtitle", type: "textarea", full: true },
      { key: "search_placeholder", label: "Search placeholder", full: true },
      { key: "event_name", label: "Event countdown — name", placeholder: "Eid ul Adha", hint: "Shows a countdown on the home page. Leave empty to hide it." },
      { key: "event_date", label: "Event date", placeholder: "2027-05-16", hint: "YYYY-MM-DD, Pakistan time. Update it once the moon is sighted, and for next year after Eid." },
      { key: "event_note", label: "Event note", full: true, placeholder: "Expected date — final after the moon sighting." },
    ],
  },
  {
    id: "footer", title: "Footer & Social", description: "Footer text, copyright line and social profiles.", icon: Share2,
    fields: [
      { key: "footer_about", label: "About text", type: "textarea", full: true, hint: "A short line under the footer logo. Leave empty to use the tagline." },
      { key: "footer_copyright", label: "Copyright line", full: true, placeholder: "© {year} {site_name}. All rights reserved.", hint: "{year} is replaced with the current year." },
      { key: "social_facebook", label: "Facebook page URL", type: "url", placeholder: "https://facebook.com/…" },
      { key: "social_instagram", label: "Instagram URL", type: "url", placeholder: "https://instagram.com/…" },
      { key: "social_youtube", label: "YouTube URL", type: "url", placeholder: "https://youtube.com/…" },
      { key: "social_tiktok", label: "TikTok URL", type: "url", placeholder: "https://tiktok.com/@…" },
      { key: "social_x", label: "X (Twitter) URL", type: "url", placeholder: "https://x.com/…" },
    ],
  },
  {
    id: "contact", title: "Contact", description: "Public contact details shown in the footer and help pages.", icon: Phone,
    fields: [
      { key: "contact_email", label: "Support email" },
      { key: "contact_phone", label: "Support phone" },
      { key: "whatsapp_number", label: "WhatsApp number", placeholder: "923001234567", hint: "International format, digits only." },
    ],
  },
  {
    id: "listings", title: "Listings & Posting", description: "Ad lifetime, free quota and photo limits.", icon: ListChecks,
    fields: [
      { key: "listing_expiry_days", label: "Ad expiry (days)", type: "number", hint: "How long an ad stays live. 0 = ads never expire. Sellers get a reminder 2 days before and renew with one tap; admins' own ads never expire." },
      { key: "expired_reactivation_days", label: "Reactivation window (days)", type: "number", hint: "How long after expiry a seller can still renew the ad. 0 = any time." },
      { key: "default_free_ad_quota", label: "Free live ads per seller", type: "number", hint: "How many ads a seller without a plan can have live at once (1 recommended). Posting more sends them to Plans." },
      { key: "max_photos_per_ad", label: "Max photos per ad", type: "number" },
    ],
  },
  { id: "seo", title: "SEO & Sharing", description: "Image shown when the site is shared on WhatsApp, Facebook etc.", icon: SeoIcon },
  { id: "email", title: "Email", description: "How verification codes and notices are emailed. Send yourself a test to check it works.", icon: Mail },
  { id: "notifications", title: "Admin alerts", description: "Which events reach your team's Discord channel — new ads, payments, reports, security, server errors and the 9:00 daily report.", icon: Bell },
  {
    id: "code", title: "Code & Tracking", description: "Verification and tracking code added to every page — Google Search Console, Analytics, Tag Manager, Facebook Pixel.", icon: Code2,
    fields: [
      {
        key: "head_code", label: "Head code (inside <head>)", type: "code", full: true,
        placeholder: '<meta name="google-site-verification" content="…" />\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXX"></script>\n<script>…</script>',
        hint: "Paste the code exactly as Google / Facebook give it. Supported: <meta>, <link>, <script>, <noscript> and <style> tags. It goes live on every page as soon as you save.",
      },
      {
        key: "body_code", label: "Body code (right after <body>)", type: "code", full: true,
        placeholder: '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-XXXX" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
        hint: "Only for code that asks to be placed right after the opening <body> tag, such as Google Tag Manager's <noscript> part. Most snippets go in Head code.",
      },
    ],
  },
];

const inputCls = "w-full bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary transition-colors";

function SettingsInner() {
  const { toast } = useToast();
  const router = useRouter();
  const sp = useSearchParams();
  const tab = TABS.find((t) => t.id === sp.get("tab")) || TABS[0];
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/settings");
        const j = await r.json();
        if (j.success) { setValues(j.data || {}); setInitial(j.data || {}); }
        else toast.error(j.message || "Couldn't load settings");
      } catch { toast.error("Couldn't load settings"); }
      finally { setLoading(false); }
    })();
  }, [toast]);

  const dirty = useMemo(() => Object.keys(values).some((k) => (values[k] ?? "") !== (initial[k] ?? "")), [values, initial]);
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const changed: Record<string, string> = {};
      for (const k of Object.keys(values)) if ((values[k] ?? "") !== (initial[k] ?? "")) changed[k] = values[k] ?? "";
      const r = await fetch("/api/admin/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings: changed }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      setInitial(values);
      toast.success("Saved — the live site is updated");
    } catch (e: any) {
      toast.error(e.message || "Couldn't save settings");
    } finally { setSaving(false); }
  };

  const saveBtn = (
    <button onClick={save} disabled={loading || saving || !dirty} className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-5 py-3 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
      {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
    </button>
  );

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Settings</h1>
          <p className="text-xs text-content-secondary mt-1">Everything here is live — changes appear on the site as soon as you save.</p>
        </div>
        {saveBtn}
      </div>

      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.id === tab.id;
          return (
            <button key={t.id} onClick={() => router.replace(`/admin/settings?tab=${t.id}`, { scroll: false })}
              className={`shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border transition-colors ${on ? "bg-primary text-white border-primary" : "bg-card text-content-secondary border-card-border hover:text-primary"}`}>
              <Icon className="h-4 w-4" /> {t.title}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-content-secondary"><Loader2 className="h-6 w-6 animate-spin mr-2" /> Loading…</div>
      ) : (
        <section className="bg-card border border-card-border rounded-2xl shadow-sm p-5 sm:p-6">
          <div className="mb-6 border-b border-card-border pb-4">
            <h2 className="text-base font-bold text-content">{tab.title}</h2>
            <p className="text-xs text-content-secondary mt-0.5">{tab.description}</p>
          </div>

          {tab.id === "branding" && <BrandingTab values={values} set={set} />}
          {tab.id === "email" && <EmailTab />}
          {tab.id === "notifications" && <NotificationsTab />}
          {tab.id === "seo" && (
            <div className="grid sm:grid-cols-2 gap-6">
              <ImageField label="Share image (1200 × 630)" value={values.og_image} onChange={(v) => set("og_image", v)} folder="branding" admin aspect="wide" hint="Shown as the preview when someone shares a link to the site." />
            </div>
          )}
          {tab.fields && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5">
              {tab.fields.map((f) => (
                <div key={f.key} className={`flex flex-col gap-1.5 ${f.full ? "sm:col-span-2" : ""}`}>
                  <label htmlFor={f.key} className="text-xs font-bold text-content-secondary uppercase tracking-wider">{f.label}</label>
                  {f.type === "code" ? (
                    <textarea id={f.key} rows={8} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off"
                      className={`${inputCls} font-mono text-xs leading-relaxed resize-y`} />
                  ) : f.type === "textarea" ? (
                    <textarea id={f.key} rows={3} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={`${inputCls} resize-none`} />
                  ) : (
                    <input id={f.key} type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"} value={values[f.key] ?? ""} placeholder={f.placeholder} onChange={(e) => set(f.key, e.target.value)} className={inputCls} />
                  )}
                  {f.hint && <p className="text-[11px] text-content-tertiary">{f.hint}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {!loading && <div className="flex justify-end">{saveBtn}</div>}
    </div>
  );
}

function BrandingTab({ values, set }: { values: Record<string, string>; set: (k: string, v: string) => void }) {
  const hm = Number(values.logo_height_mobile) || 30;
  const hd = Number(values.logo_height_desktop) || 36;
  const hf = Number(values.footer_logo_height) || 36;
  const color = /^#[0-9a-f]{6}$/i.test(values.brand_color || "") ? values.brand_color : "#1a56db";
  const name = values.site_name || "Classifieds";
  const Preview = ({ h, logo }: { h: number; logo?: string }) => (
    <div className="h-16 rounded-xl border border-card-border bg-white flex items-center px-4 gap-3 overflow-hidden">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" style={{ height: Math.min(h, 56) }} className="w-auto object-contain" />
      ) : (
        <span className="text-lg font-bold text-slate-900">{name}</span>
      )}
      <span className="ml-auto h-8 w-24 rounded-lg bg-slate-100" />
      <span className="h-8 w-16 rounded-lg" style={{ background: color }} />
    </div>
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="grid lg:grid-cols-2 gap-6">
        <ImageField label="Header logo" value={values.site_logo} onChange={(v) => set("site_logo", v)} folder="branding" admin aspect="logo" allowUrl
          hint="PNG with a transparent background works best. Leave empty to show the site name as text." />
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">Logo size</span>
          <Slider label="On phones" value={hm} min={18} max={52} onChange={(n) => set("logo_height_mobile", String(n))} />
          <Slider label="On desktop" value={hd} min={20} max={56} onChange={(n) => set("logo_height_desktop", String(n))} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-semibold text-content-tertiary">Preview — phone</span>
            <Preview h={hm} logo={values.site_logo} />
            <span className="text-[11px] font-semibold text-content-tertiary mt-1">Preview — desktop</span>
            <Preview h={hd} logo={values.site_logo} />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 border-t border-card-border pt-6">
        <ImageField label="Footer logo (optional)" value={values.footer_logo} onChange={(v) => set("footer_logo", v)} folder="branding" admin aspect="logo"
          hint="Leave empty to use the header logo in the footer too." />
        <div className="flex flex-col gap-4">
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">Footer logo size</span>
          <Slider label="Height" value={hf} min={20} max={80} onChange={(n) => set("footer_logo_height", String(n))} />
          <div className="h-24 rounded-xl border border-card-border bg-surface-secondary flex items-center px-4">
            {values.footer_logo || values.site_logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.footer_logo || values.site_logo} alt="" style={{ height: hf }} className="w-auto object-contain" />
            ) : <span className="text-xl font-bold text-content">{name}</span>}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 border-t border-card-border pt-6">
        <ImageField label="Favicon (browser tab icon)" value={values.site_favicon} onChange={(v) => set("site_favicon", v)} folder="branding" admin aspect="square"
          hint="A square image, at least 256 × 256." />
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">Brand colour</span>
          <div className="flex items-center gap-3">
            <input type="color" value={color} onChange={(e) => set("brand_color", e.target.value)} className="h-12 w-16 rounded-lg border border-card-border bg-surface cursor-pointer" />
            <input value={values.brand_color || ""} onChange={(e) => set("brand_color", e.target.value.trim())} placeholder="#1a56db" className={`${inputCls} max-w-[160px]`} />
            {values.brand_color && <button type="button" onClick={() => set("brand_color", "")} className="text-xs font-semibold text-content-tertiary hover:text-primary">Reset</button>}
          </div>
          <p className="text-[11px] text-content-tertiary">Buttons, links and highlights across the site use this colour. Leave empty for the default blue.</p>
          <div className="flex gap-2 mt-1">
            <span className="h-10 px-4 rounded-lg text-white text-sm font-semibold grid place-items-center" style={{ background: color }}>Post ad</span>
            <span className="h-10 px-4 rounded-lg text-sm font-semibold grid place-items-center border" style={{ color, borderColor: color }}>View all</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Email set-up (read from the server's .env) + a test send that shows the mail server's exact answer. */
function EmailTab() {
  const [info, setInfo] = useState<{ configured: boolean; host: string; port: number; from: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => { fetch("/api/admin/email-test").then((r) => r.json()).then((j) => j.success && setInfo(j.data)).catch(() => {}); }, []);
  const test = async () => {
    setBusy(true); setResult(null);
    try {
      const j = await fetch("/api/admin/email-test", { method: "POST" }).then((r) => r.json());
      setResult({ ok: !!j.success, message: j.message || (j.success ? "Sent" : "Failed") });
    } catch { setResult({ ok: false, message: "Couldn't reach the server" }); }
    finally { setBusy(false); }
  };
  const Row = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-card-border last:border-0 text-sm">
      <span className="text-content-secondary">{k}</span><span className="font-semibold text-content text-right break-all">{v}</span>
    </div>
  );
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-card-border p-4">
        {info ? (<>
          <Row k="Status" v={info.configured ? <span className="text-emerald-600">Set up</span> : <span className="text-danger">Not set up (SMTP_USER / SMTP_PASS missing)</span>} />
          <Row k="Mail server" v={`${info.host}:${info.port}`} />
          <Row k="Sent from" v={info.from || "—"} />
        </>) : <div className="flex items-center gap-2 text-sm text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        <p className="text-[11px] text-content-tertiary mt-3">These come from the server&apos;s .env file (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM). For Gmail, SMTP_PASS must be an App Password. The name people see is your site name.</p>
      </div>
      <div className="flex flex-col gap-3">
        <button onClick={test} disabled={busy} className="inline-flex items-center justify-center gap-2 h-11 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send me a test email
        </button>
        {result && (
          <div role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
            {result.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
            <span>{result.message}</span>
          </div>
        )}
        <p className="text-[11px] text-content-tertiary">Goes to your admin email address, using the same connection as sign-up codes.</p>
      </div>
    </div>
  );
}

type NotifyState = { fromEnv: boolean; connected: boolean; webhookSaved: boolean; categories: { id: string; label: string; hint: string; on: boolean }[] };

/** Which admin alerts reach the team's Discord channel, plus a test send and "send today's report now". */
function NotificationsTab() {
  const { toast } = useToast();
  const [s, setS] = useState<NotifyState | null>(null);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [webhook, setWebhook] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = (d: NotifyState) => { setS(d); setOff(new Set(d.categories.filter((c) => !c.on).map((c) => c.id))); };
  useEffect(() => { fetch("/api/admin/notify").then((r) => r.json()).then((j) => j.success && load(j.data)).catch(() => {}); }, []);

  const save = async () => {
    setBusy("save");
    try {
      const body: Record<string, unknown> = { off: [...off] };
      if (!s?.fromEnv && webhook.trim()) body.webhook = webhook.trim();
      const j = await fetch("/api/admin/notify", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
      if (!j.success) throw new Error(j.message);
      load(j.data); setWebhook("");
      toast.success(j.message);
    } catch (e: any) { toast.error(e.message || "Couldn't save"); } finally { setBusy(null); }
  };
  const send = async (kind: "test" | "digest") => {
    setBusy(kind);
    try {
      const j = await fetch("/api/admin/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind }) }).then((r) => r.json());
      if (!j.success) throw new Error(j.message);
      toast.success(j.message);
    } catch (e: any) { toast.error(e.message || "Couldn't send"); } finally { setBusy(null); }
  };

  if (!s) return <div className="flex items-center gap-2 text-sm text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  return (
    <div className="flex flex-col gap-6">
      <div className={`rounded-xl border p-4 text-sm ${s.connected ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300"}`}>
        {s.connected
          ? s.fromEnv ? "Connected — the channel is set on the server (DISCORD_WEBHOOK_URL)." : "Connected to your Discord channel."
          : "No channel connected yet. In Discord: Server settings → Integrations → Webhooks → New webhook → Copy URL, then paste it below."}
      </div>
      {!s.fromEnv && (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-bold text-content-secondary uppercase tracking-wider">Discord webhook link {s.webhookSaved ? "(saved — paste a new one to replace it)" : ""}</span>
          <input type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://discord.com/api/webhooks/…" className={inputCls} autoComplete="off" />
        </label>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        {s.categories.map((c) => {
          const on = !off.has(c.id);
          return (
            <label key={c.id} className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition-colors ${on ? "border-primary/40 bg-primary/5" : "border-card-border"}`}>
              <input type="checkbox" checked={on} onChange={() => setOff((p) => { const n = new Set(p); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })} className="mt-1 accent-primary" />
              <span><span className="block text-sm font-bold text-content">{c.label}</span><span className="block text-xs text-content-secondary mt-0.5">{c.hint}</span></span>
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={save} disabled={!!busy} className="inline-flex items-center gap-2 h-11 px-5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold disabled:opacity-60">
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save alerts
        </button>
        <button onClick={() => send("test")} disabled={!!busy || !s.connected} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-card-border text-sm font-bold text-content hover:border-primary disabled:opacity-50">
          {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send a test alert
        </button>
        <button onClick={() => send("digest")} disabled={!!busy || !s.connected} className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-card-border text-sm font-bold text-content hover:border-primary disabled:opacity-50">
          {busy === "digest" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Send today&apos;s report now
        </button>
      </div>
      <p className="text-[11px] text-content-tertiary">Each alert says who it is about and links straight to it in the admin panel. Server errors are sent at most once every 30 minutes per error.</p>
    </div>
  );
}

function Slider({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="w-24 text-content-secondary">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-primary" />
      <span className="w-14 text-right tabular-nums font-semibold text-content">{value}px</span>
    </label>
  );
}

export default function AdminSettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsInner />
    </Suspense>
  );
}

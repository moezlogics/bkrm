"use client";

/**
 * Push settings: the master switch, icons, the wording and timing of the
 * "allow notifications" prompt, quiet hours, the daily limit, and the
 * thresholds the automatic notifications use.
 */
import React, { useState } from "react";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { Loader2, Save, BellRing, KeyRound, Server } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";
import { card, input, label, btnPrimary, jsonFetch, Toggle } from "./ui";

export function SettingsTab({ data, reload }: { data: any; reload: () => void }) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<any>(data.config);
  const [saving, setSaving] = useState(false);
  const set = (patch: any) => setCfg((c: any) => ({ ...c, ...patch }));
  const setPrompt = (patch: any) => setCfg((c: any) => ({ ...c, prompt: { ...c.prompt, ...patch } }));
  const setContext = (k: string, patch: any) => setCfg((c: any) => ({ ...c, prompt: { ...c.prompt, contexts: { ...c.prompt.contexts, [k]: { ...c.prompt.contexts[k], ...patch } } } }));

  const save = async () => {
    setSaving(true);
    const j = await jsonFetch("/api/admin/push/settings", { method: "PUT", body: JSON.stringify({ config: cfg }) });
    setSaving(false);
    j.success ? toast.success(j.message) : toast.error(j.message || "Couldn't save");
    reload();
  };

  const CONTEXTS: { k: string; when: string }[] = [
    { k: "post", when: "just after someone posts an ad" },
    { k: "save", when: "just after someone saves an ad" },
    { k: "chat", when: "just after someone sends a chat message" },
    { k: "payment", when: "just after a seller sends a plan payment" },
    { k: "verify", when: "just after a seller sends their CNIC" },
    ...(BOOKINGS_ON ? [{ k: "booking", when: "just after a booking is made" }] : []),
    { k: "inbox", when: "on the notifications page (a card, not a popup)" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-content-secondary max-w-2xl">Everything here is used live on the site — the prompt wording, the icons and the limits.</p>
        <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</button>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <h2 className="text-sm font-bold text-content flex items-center gap-2"><Server className="h-4 w-4 text-primary" /> System</h2>
        <Toggle on={!!cfg.enabled} onChange={(v) => set({ enabled: v })} label="Notifications are on" hint="Switch off to stop every push — automatic and manual — without losing any subscribers." />
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 rounded-xl bg-surface-secondary p-3 text-xs">
            <p className="font-bold text-content flex items-center gap-1.5"><KeyRound className="h-3.5 w-3.5" /> Signing keys</p>
            <p className="text-content-secondary mt-1">
              {data.system.keys
                ? <>Configured (ends …{data.system.publicKeyTail}). Never change these — every subscriber would have to allow notifications again.</>
                : <>Missing. Generate a pair with <code className="bg-card px-1 rounded">npx web-push generate-vapid-keys</code> and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY on the server.</>}
            </p>
          </div>
          <div className="flex-1 rounded-xl bg-surface-secondary p-3 text-xs">
            <p className="font-bold text-content">Sending process</p>
            <p className="text-content-secondary mt-1">{data.system.worker ? "This server sends campaigns and reminders." : "This server doesn't send (PUSH_WORKER=0); a separate worker process does."}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ImageField label="Notification icon" value={cfg.icon} onChange={(v) => set({ icon: v })} folder="general" admin aspect="square" />
          <ImageField label="Status-bar icon (Android, plain white on transparent)" value={cfg.badge} onChange={(v) => set({ badge: v })} folder="general" admin aspect="square" />
        </div>
        <p className="text-[12px] text-content-tertiary -mt-2">Leave the icon empty to use the site logo/favicon automatically.</p>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <h2 className="text-sm font-bold text-content flex items-center gap-2"><BellRing className="h-4 w-4 text-primary" /> The ask on the site</h2>
        <Toggle on={!!cfg.prompt.enabled} onChange={(v) => setPrompt({ enabled: v })} label="Ask visitors automatically" />
        <div>
          <label className={label}>How to ask</label>
          <select className={`${input} mt-1`} value={cfg.prompt.style || "card"} onChange={(e) => setPrompt({ style: e.target.value })}>
            <option value="card">Our card first, then the browser&apos;s prompt (recommended)</option>
            <option value="browser">The browser&apos;s prompt straight away</option>
          </select>
          <p className="text-[12px] text-content-tertiary mt-1">
            {cfg.prompt.style === "browser"
              ? "Chrome, Edge and Android show the browser's prompt directly; Firefox and Safari still need a tap, so they see the card. If people often close the browser's prompt, Chrome starts blocking it for the whole domain — including any other push service on it."
              : "“Not now” on our card doesn't count against the domain, so the browser's prompt stays available — safest when the domain also runs another push service."}
            {" "}Notification permission is shared across the whole domain: people who already allowed or blocked it elsewhere on the domain aren't asked again (if they allowed it, they're signed up automatically).
          </p>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div><label className={label}>Title</label><input className={`${input} mt-1`} value={cfg.prompt.title} onChange={(e) => setPrompt({ title: e.target.value })} /></div>
          <div><label className={label}>Message</label><input className={`${input} mt-1`} value={cfg.prompt.body} onChange={(e) => setPrompt({ body: e.target.value })} /></div>
          <div><label className={label}>Allow button</label><input className={`${input} mt-1`} value={cfg.prompt.allow} onChange={(e) => setPrompt({ allow: e.target.value })} /></div>
          <div><label className={label}>Dismiss button</label><input className={`${input} mt-1`} value={cfg.prompt.later} onChange={(e) => setPrompt({ later: e.target.value })} /></div>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={label}>Show after (pages)</label><input type="number" min={1} className={`${input} mt-1`} value={cfg.prompt.minPageViews} onChange={(e) => setPrompt({ minPageViews: Number(e.target.value) })} /></div>
          <div><label className={label}>Delay (seconds)</label><input type="number" min={0} className={`${input} mt-1`} value={cfg.prompt.delaySec} onChange={(e) => setPrompt({ delaySec: Number(e.target.value) })} /></div>
          <div><label className={label}>Ask again after (days)</label><input type="number" min={1} className={`${input} mt-1`} value={cfg.prompt.snoozeDays} onChange={(e) => setPrompt({ snoozeDays: Number(e.target.value) })} /></div>
          <div><label className={label}>Never on pages</label><input className={`${input} mt-1`} value={cfg.prompt.excludePaths} onChange={(e) => setPrompt({ excludePaths: e.target.value })} /></div>
        </div>
        <div className="flex flex-col gap-3">
          <p className="text-xs font-bold text-content-tertiary uppercase tracking-wider">Wording right after an action</p>
          {CONTEXTS.map(({ k, when: w }) => (
            <div key={k} className="grid grid-cols-1 lg:grid-cols-2 gap-3 rounded-xl bg-surface-secondary p-3">
              <div className="lg:col-span-2 text-[12px] font-semibold text-content-secondary capitalize">{k} — {w}</div>
              <input className={input} value={cfg.prompt.contexts[k]?.title || ""} onChange={(e) => setContext(k, { title: e.target.value })} placeholder="Title" />
              <input className={input} value={cfg.prompt.contexts[k]?.body || ""} onChange={(e) => setContext(k, { body: e.target.value })} placeholder="Message" />
            </div>
          ))}
        </div>
      </div>

      <div className={`${card} flex flex-col gap-4`}>
        <h2 className="text-sm font-bold text-content">Good manners</h2>
        <Toggle on={!!cfg.quiet.enabled} onChange={(v) => set({ quiet: { ...cfg.quiet, enabled: v } })} label="Quiet hours" hint="Notifications wait until morning — except the ones set to “send straight away” in the Automatic tab (messages, offers, ad and account updates by default)." />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div><label className={label}>Quiet from</label><input type="time" className={`${input} mt-1`} value={cfg.quiet.start} onChange={(e) => set({ quiet: { ...cfg.quiet, start: e.target.value } })} /></div>
          <div><label className={label}>Quiet until</label><input type="time" className={`${input} mt-1`} value={cfg.quiet.end} onChange={(e) => set({ quiet: { ...cfg.quiet, end: e.target.value } })} /></div>
          <div><label className={label}>Time zone</label><input className={`${input} mt-1`} value={cfg.timezone} onChange={(e) => set({ timezone: e.target.value })} /></div>
          <div><label className={label}>Max per person per day</label><input type="number" min={1} className={`${input} mt-1`} value={cfg.dailyCap} onChange={(e) => set({ dailyCap: Number(e.target.value) })} /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div>
            <label className={label}>View milestones</label>
            <input className={`${input} mt-1`} value={cfg.milestones} onChange={(e) => set({ milestones: e.target.value })} />
            <p className="text-[12px] text-content-tertiary mt-1">Tell a seller when their ad passes these view counts.</p>
          </div>
          <div>
            <label className={label}>Price drop must be at least (%)</label>
            <input type="number" min={1} max={90} className={`${input} mt-1`} value={cfg.priceDropMinPct} onChange={(e) => set({ priceDropMinPct: Number(e.target.value) })} />
            <p className="text-[12px] text-content-tertiary mt-1">Smaller cuts don&apos;t notify the people who saved the ad.</p>
          </div>
        </div>
      </div>

      <button onClick={save} disabled={saving} className={`${btnPrimary} self-start`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings</button>
    </div>
  );
}

"use client";

/**
 * Admin → Push notifications. One screen for the whole system:
 * who's subscribed (Overview), manual campaigns, the automatic notifications,
 * every device (Subscribers) and the settings behind all of it.
 */
import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Bell, BellOff, BellRing } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { pushPermission, pushSupport, enablePush } from "@/lib/push-client";
import { jsonFetch, btnGhost } from "./ui";
import { Overview } from "./Overview";
import { Campaigns } from "./Campaigns";
import { Automations } from "./Automations";
import { Subscribers } from "./Subscribers";
import { SettingsTab } from "./SettingsTab";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "campaigns", label: "Campaigns" },
  { id: "automations", label: "Automatic" },
  { id: "subscribers", label: "Subscribers" },
  { id: "settings", label: "Settings" },
];

function PushCentre() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const tab = TABS.some((t) => t.id === params.get("tab")) ? params.get("tab")! : "overview";
  const [settings, setSettings] = useState<any>(null);
  const [options, setOptions] = useState<any>(null);
  const [perm, setPerm] = useState<string>("default");
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    const j = await jsonFetch("/api/admin/push/settings");
    if (j.success) setSettings(j);
  }, []);
  useEffect(() => { loadSettings(); jsonFetch("/api/admin/push/options").then((j) => j.success && setOptions(j)); }, [loadSettings]);
  useEffect(() => { setPerm(pushPermission()); }, []);

  const enableHere = async () => {
    setBusy(true);
    const r = await enablePush("admin");
    setBusy(false);
    setPerm(pushPermission());
    if (r.ok) toast.success("This browser will now receive test notifications");
    else if (r.reason === "denied") toast.error("Your browser is blocking notifications for this site");
    else if (r.reason === "ios-install") toast.error("On iPhone, add the site to the Home Screen first");
    else toast.error("Couldn't turn on notifications here");
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Push notifications</h1>
          <p className="text-xs text-content-secondary mt-1">Reach people on their phone even when the site is closed — automatically, or with a campaign you write.</p>
        </div>
        {pushSupport() !== "unsupported" && (
          perm === "granted" ? (
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <BellRing className="h-4 w-4" /> Notifications on in this browser
            </span>
          ) : (
            <button onClick={enableHere} disabled={busy} className={btnGhost}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : perm === "denied" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
              {perm === "denied" ? "Blocked in this browser" : "Enable here (for testing)"}
            </button>
          )
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-card-border overflow-x-auto hide-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => router.replace(`/admin/push?tab=${t.id}`, { scroll: false })}
            className={`shrink-0 px-4 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${tab === t.id ? "border-primary text-primary" : "border-transparent text-content-secondary hover:text-content"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview types={settings?.types || []} />}
      {tab === "campaigns" && <Campaigns />}
      {tab === "subscribers" && <Subscribers options={options} />}
      {(tab === "automations" || tab === "settings") && (
        !settings ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 text-primary animate-spin" /></div>
        ) : tab === "automations" ? (
          <Automations key={settings.config?.updatedAt || "a"} data={settings} reload={loadSettings} />
        ) : (
          <SettingsTab key={settings.config?.updatedAt || "s"} data={settings} reload={loadSettings} />
        )
      )}
    </div>
  );
}

/** useSearchParams needs a Suspense boundary above it (same as the other admin screens). */
export default function AdminPushPage() {
  return (
    <Suspense fallback={null}>
      <PushCentre />
    </Suspense>
  );
}

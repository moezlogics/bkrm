"use client";

/**
 * My notifications: turn them on for this device, choose what to be notified
 * about, see every device that's on, and send yourself a test.
 */
import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Bell, BellOff, BellRing, Loader2, Smartphone, Tablet, Monitor, Trash2, Share } from "lucide-react";
import { AppBar } from "@/components/layout/AppChrome";
import { useToast } from "@/components/ui/Toast";
import { pushSupport, pushPermission, enablePush, disablePush, currentPushEndpoint } from "@/lib/push-client";

const ICON: Record<string, React.ElementType> = { mobile: Smartphone, tablet: Tablet, desktop: Monitor };

export default function NotificationsPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [data, setData] = useState<any>(null);
  const [perm, setPerm] = useState<string>("default");
  const [support, setSupport] = useState<string>("ok");
  const [tail, setTail] = useState<string | null>(null);
  const [busy, setBusy] = useState("");

  useEffect(() => { if (status === "unauthenticated") router.replace("/login?callbackUrl=/dashboard/notifications/settings"); }, [status, router]);

  const load = useCallback(async () => {
    const r = await fetch("/api/push/prefs");
    const j = await r.json().catch(() => null);
    if (j?.success) setData(j);
    setPerm(pushPermission());
    setSupport(pushSupport());
    setTail((await currentPushEndpoint())?.slice(-24) || null);
  }, []);
  useEffect(() => { if (status === "authenticated") load(); }, [status, load]);

  const turnOn = async () => {
    setBusy("on");
    const r = await enablePush("settings", (session?.user as any)?.id || "");
    setBusy("");
    if (r.ok) { toast.success("Notifications are on for this device"); load(); }
    else if (r.reason === "denied") toast.error("Your browser is blocking notifications — allow them in site settings");
    else toast.error("Couldn't turn notifications on here");
  };
  const turnOff = async () => {
    setBusy("off");
    await disablePush();
    setBusy("");
    toast.success("Notifications off on this device");
    load();
  };
  const toggleCat = async (id: string) => {
    const off = data.off.includes(id) ? data.off.filter((x: string) => x !== id) : [...data.off, id];
    setData({ ...data, off });
    const j = await fetch("/api/push/prefs", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ off }) }).then((r) => r.json());
    if (!j.success) { toast.error("Couldn't save"); load(); }
  };
  const removeDevice = async (id: string) => {
    await fetch(`/api/push/prefs?id=${id}`, { method: "DELETE" });
    load();
  };

  if (status !== "authenticated" || !data) {
    return (<><AppBar title="Notification settings" backHref="/dashboard/notifications" /><div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></>);
  }
  const on = perm === "granted" && !!tail;

  return (
    <>
      <AppBar title="Notification settings" subtitle="This device, what to tell you about, your devices" backHref="/dashboard/notifications" />
      <div className="wrap py-4 flex flex-col gap-4 pb-mobile-nav">
        {/* This device */}
        <section className="rounded-2xl border border-card-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className={`h-11 w-11 shrink-0 rounded-xl grid place-items-center ${on ? "bg-primary/10 text-primary" : "bg-surface-secondary text-content-tertiary"}`}>
              {on ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-content">{on ? "On for this device" : "Off for this device"}</p>
              <p className="text-xs text-content-secondary mt-0.5">
                {support === "ios-install" ? "On iPhone, add this site to your Home Screen first, then open it from there."
                  : support === "unsupported" ? "This browser can't show notifications."
                  : perm === "denied" ? "Your browser is blocking notifications for this site. Allow them in the address-bar site settings."
                  : on ? "You'll hear about new messages, offers and price drops even when the site is closed."
                  : "Turn them on so you don't miss a buyer or a deal."}
              </p>
              {support === "ios-install" && (
                <p className="mt-2 rounded-xl bg-surface-secondary px-3 py-2 text-xs text-content-secondary">
                  Tap <Share className="inline h-3.5 w-3.5 -mt-0.5" /> <b>Share</b> → <b>Add to Home Screen</b>.
                </p>
              )}
            </div>
          </div>
          {support === "ok" && perm !== "denied" && (
            <div className="mt-3 flex gap-2">
              {on ? (
                <>
                  <button onClick={turnOff} disabled={!!busy} className="flex-1 h-11 rounded-xl border border-card-border text-sm font-semibold text-content hover:bg-surface-secondary inline-flex items-center justify-center gap-2">
                    {busy === "off" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellOff className="h-4 w-4" />} Turn off on this device
                  </button>
                </>
              ) : (
                <button onClick={turnOn} disabled={!!busy} className="flex-1 h-11 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold inline-flex items-center justify-center gap-2">
                  {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Turn on notifications
                </button>
              )}
            </div>
          )}
        </section>

        {/* What to send */}
        <section className="rounded-2xl border border-card-border bg-card p-4">
          <h2 className="text-sm font-bold text-content mb-1">What to notify me about</h2>
          <p className="text-xs text-content-secondary mb-3">Applies to all your devices.</p>
          <div className="flex flex-col divide-y divide-card-border/60">
            {data.categories.map((c: any) => {
              const isOn = !data.off.includes(c.id);
              return (
                <label key={c.id} className="flex items-start gap-3 py-3 cursor-pointer">
                  <button type="button" role="switch" aria-checked={isOn} onClick={() => toggleCat(c.id)}
                    className={`mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${isOn ? "bg-primary" : "bg-slate-300"}`}>
                    <span className={`block h-5 w-5 rounded-full bg-white shadow transition-transform ${isOn ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-content">{c.label}</span>
                    <span className="block text-xs text-content-secondary">{c.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </section>

        {/* Devices */}
        <section className="rounded-2xl border border-card-border bg-card p-4">
          <h2 className="text-sm font-bold text-content mb-3">Your devices</h2>
          {data.devices.length === 0 ? (
            <p className="text-xs text-content-secondary">No device is receiving notifications yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-card-border/60">
              {data.devices.map((d: any) => {
                const Icon = ICON[d.device] || Monitor;
                return (
                  <div key={d.id} className="flex items-center gap-3 py-3">
                    <Icon className="h-4 w-4 text-content-tertiary shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-content truncate">
                        {d.browser} · {d.os} {d.tail === tail && <span className="text-primary font-bold">· this device</span>}
                      </span>
                      <span className="block text-[11px] text-content-tertiary">{d.place || "Location unknown"} · added {new Date(d.since).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
                    </span>
                    <button onClick={() => removeDevice(d.id)} aria-label="Remove device" className="p-2 rounded-lg text-content-tertiary hover:text-danger hover:bg-surface-secondary"><Trash2 className="h-4 w-4" /></button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

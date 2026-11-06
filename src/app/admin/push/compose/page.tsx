"use client";

/**
 * Write a campaign: what it says, who gets it, and when it goes.
 * The preview shows what lands on a phone, and the audience box shows how
 * many devices the current choices reach before anything is sent.
 */
import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Send, Save, Clock, TestTube2, Users, Plus, X } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";
import { withBase } from "@/lib/push-client";
import { card, input, label, btnPrimary, btnGhost, jsonFetch, fmt } from "../ui";
import { VERTICAL } from "@/vertical";

type Audience = {
  who: string; cityIds: string[]; states: string[]; devices: string[]; browsers: string[]; os: string[];
  userIds: string[]; activeWithinDays: number;
};
const EMPTY: Audience = { who: "all", cityIds: [], states: [], devices: [], browsers: [], os: [], userIds: [], activeWithinDays: 0 };
const WHO = [
  { id: "all", label: "Everyone" }, { id: "users", label: "Signed-in people" }, { id: "guests", label: "Guests" },
  { id: "sellers", label: "Sellers" }, { id: "buyers", label: "Buyers" }, { id: "specific", label: "Chosen people" },
];

function Composer() {
  const router = useRouter();
  const { toast } = useToast();
  const editId = useSearchParams().get("id");
  const [form, setForm] = useState<any>({ name: "", title: "", body: "", url: "/", icon: "", image: "", actions: [], requireInteraction: false, ttlHours: 24, urgency: "normal" });
  const [audience, setAudience] = useState<Audience>(EMPTY);
  const [options, setOptions] = useState<any>(null);
  const [site, setSite] = useState({ siteName: "", icon: "" });
  const [reach, setReach] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [when, setWhen] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [people, setPeople] = useState<any[]>([]);
  const [personQuery, setPersonQuery] = useState("");

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setAud = (patch: Partial<Audience>) => setAudience((a) => ({ ...a, ...patch }));
  const toggle = (key: keyof Audience, v: string) =>
    setAudience((a) => {
      const list = a[key] as string[];
      return { ...a, [key]: list.includes(v) ? list.filter((x) => x !== v) : [...list, v] };
    });

  useEffect(() => {
    jsonFetch("/api/admin/push/options").then((j) => j.success && setOptions(j));
    fetch("/api/push/config").then((r) => r.json()).then((c) => setSite({ siteName: c.siteName || "", icon: c.icon || "" })).catch(() => {});
    if (editId) {
      jsonFetch(`/api/admin/push/campaigns/${editId}`).then((j) => {
        if (!j.success) return;
        const c = j.data;
        setForm({ name: c.name, title: c.title, body: c.body, url: c.url, icon: c.icon || "", image: c.image || "", actions: c.actions || [], requireInteraction: c.requireInteraction, ttlHours: c.ttlHours, urgency: c.urgency });
        setAudience({ ...EMPTY, ...(c.audience || {}) });
      });
    }
  }, [editId]);

  // How many devices the current audience reaches (debounced).
  const audKey = JSON.stringify(audience);
  useEffect(() => {
    setReach(null);
    const t = setTimeout(async () => {
      const j = await jsonFetch("/api/admin/push/estimate", { method: "POST", body: JSON.stringify({ audience }) });
      setReach(j.success ? j.count : -1);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audKey]);

  // People picker for "Chosen people".
  useEffect(() => {
    if (audience.who !== "specific" || personQuery.trim().length < 2) return;
    const t = setTimeout(async () => {
      const j = await jsonFetch(`/api/admin/users?search=${encodeURIComponent(personQuery.trim())}`);
      if (j.success) setPeople(j.data.slice(0, 8));
    }, 350);
    return () => clearTimeout(t);
  }, [personQuery, audience.who]);

  const payload = (extra: any) => ({ ...form, audience, ...extra });
  const submit = async (mode: "draft" | "send" | "schedule") => {
    if (mode === "schedule" && !when) return toast.error("Pick a date and time");
    setBusy(mode);
    const body = JSON.stringify(payload({ mode, sendAt: when ? new Date(when).toISOString() : undefined }));
    const j = editId
      ? await jsonFetch(`/api/admin/push/campaigns/${editId}`, { method: "PATCH", body: JSON.stringify({ ...JSON.parse(body), action: "update" }) })
      : await jsonFetch("/api/admin/push/campaigns", { method: "POST", body });
    setBusy("");
    if (!j.success) return toast.error(j.message || "Couldn't save");
    toast.success(j.message);
    router.push(j.data?._id ? `/admin/push/campaigns/${j.data._id}` : "/admin/push?tab=campaigns");
  };
  const sendTest = async () => {
    setBusy("test");
    const j = await jsonFetch("/api/admin/push/test", { method: "POST", body: JSON.stringify(payload({})) });
    setBusy("");
    j.success ? toast.success(j.message) : toast.error(j.message);
  };

  const cities = useMemo(() => {
    const list = options?.cities || [];
    const q = citySearch.trim().toLowerCase();
    return q ? list.filter((c: any) => c.name.toLowerCase().includes(q)) : list;
  }, [options, citySearch]);
  const chosen = (key: keyof Audience, v: string) => (audience[key] as string[]).includes(v);
  const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${on ? "border-primary bg-primary text-white" : "border-card-border bg-surface text-content-secondary hover:border-primary"}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/push?tab=campaigns" className="p-2 rounded-lg hover:bg-surface-secondary text-content-secondary"><ArrowLeft className="h-5 w-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">{editId ? "Edit campaign" : "New campaign"}</h1>
          <p className="text-xs text-content-secondary mt-0.5">It arrives on phones and computers that allowed notifications.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-5 items-start">
        <div className="flex flex-col gap-5">
          <div className={`${card} flex flex-col gap-4`}>
            <h2 className="text-sm font-bold text-content">What it says</h2>
            <div><label className={label}>Title</label><input className={`${input} mt-1`} maxLength={90} value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Weekend deals in Lahore" /></div>
            <div><label className={label}>Message</label><textarea rows={3} className={`${input} mt-1 resize-none`} maxLength={220} value={form.body} onChange={(e) => set({ body: e.target.value })} placeholder="One or two short lines." /></div>
            <div><label className={label}>Opens</label><input className={`${input} mt-1`} value={form.url} onChange={(e) => set({ url: e.target.value })} placeholder={`/lahore/${VERTICAL.primaryTop}`} />
              <p className="text-[12px] text-content-tertiary mt-1">A page on this site (starts with /) or a full https:// address.</p></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ImageField label="Icon (optional)" value={form.icon} onChange={(v) => set({ icon: v })} folder="general" admin aspect="square" />
              <ImageField label="Big picture (optional, Android)" value={form.image} onChange={(v) => set({ image: v })} folder="general" admin aspect="wide" />
            </div>
            <div>
              <label className={label}>Buttons (up to 2)</label>
              <div className="flex flex-col gap-2 mt-1">
                {(form.actions || []).map((a: any, i: number) => (
                  <div key={i} className="flex gap-2">
                    <input className={input} placeholder="Button text" maxLength={24} value={a.title} onChange={(e) => set({ actions: form.actions.map((x: any, j: number) => (i === j ? { ...x, title: e.target.value } : x)) })} />
                    <input className={input} placeholder="/where-it-opens" value={a.url} onChange={(e) => set({ actions: form.actions.map((x: any, j: number) => (i === j ? { ...x, url: e.target.value } : x)) })} />
                    <button onClick={() => set({ actions: form.actions.filter((_: any, j: number) => j !== i) })} className="p-2 rounded-lg hover:bg-surface-secondary text-danger"><X className="h-4 w-4" /></button>
                  </div>
                ))}
                {(form.actions?.length || 0) < 2 && (
                  <button onClick={() => set({ actions: [...(form.actions || []), { title: "", url: "/" }] })} className={`${btnGhost} self-start !py-1.5 !px-3 text-xs`}><Plus className="h-3.5 w-3.5" /> Add button</button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><label className={label}>Internal name</label><input className={`${input} mt-1`} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Only you see this" /></div>
              <div><label className={label}>Keep trying for (hours)</label><input type="number" min={1} max={672} className={`${input} mt-1`} value={form.ttlHours} onChange={(e) => set({ ttlHours: Number(e.target.value) })} /></div>
              <div><label className={label}>Priority</label>
                <select className={`${input} mt-1`} value={form.urgency} onChange={(e) => set({ urgency: e.target.value })}>
                  <option value="normal">Normal</option><option value="high">High (wake the phone)</option><option value="low">Low</option>
                </select>
              </div>
            </div>
          </div>

          <div className={`${card} flex flex-col gap-4`}>
            <h2 className="text-sm font-bold text-content flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Who gets it</h2>
            <div className="flex flex-wrap gap-2">
              {WHO.map((w) => <button key={w.id} onClick={() => setAud({ who: w.id })} className={chip(audience.who === w.id)}>{w.label}</button>)}
            </div>

            {audience.who === "specific" && (
              <div>
                <label className={label}>Find people</label>
                <input className={`${input} mt-1`} value={personQuery} onChange={(e) => setPersonQuery(e.target.value)} placeholder="Name or email…" />
                {people.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1 max-h-44 overflow-y-auto">
                    {people.map((p) => (
                      <button key={p._id} onClick={() => { toggle("userIds", String(p._id)); setPersonQuery(""); setPeople([]); }}
                        className="text-left rounded-lg px-3 py-2 hover:bg-surface-secondary text-sm">
                        <b className="text-content">{p.name}</b> <span className="text-content-tertiary">{p.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                {audience.userIds.length > 0 && <p className="text-xs text-content-secondary mt-2">{audience.userIds.length} person(s) chosen <button onClick={() => setAud({ userIds: [] })} className="text-primary font-semibold">clear</button></p>}
              </div>
            )}

            <div>
              <label className={label}>Cities {audience.cityIds.length > 0 && <span className="text-primary">({audience.cityIds.length})</span>}</label>
              <input className={`${input} mt-1`} value={citySearch} onChange={(e) => setCitySearch(e.target.value)} placeholder="Search cities…" />
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {cities.map((c: any) => (
                  <button key={c.id} onClick={() => toggle("cityIds", c.id)} className={chip(chosen("cityIds", c.id))}>{c.name} <span className="opacity-70">{fmt(c.n)}</span></button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>Provinces</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{(options?.states || []).map((s: any) => <button key={s.name} onClick={() => toggle("states", s.name)} className={chip(chosen("states", s.name))}>{s.name}</button>)}</div>
              </div>
              <div>
                <label className={label}>Devices</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{["mobile", "tablet", "desktop"].map((d) => <button key={d} onClick={() => toggle("devices", d)} className={chip(chosen("devices", d))}>{d === "mobile" ? "Phone" : d === "desktop" ? "Computer" : "Tablet"}</button>)}</div>
              </div>
              <div>
                <label className={label}>Browsers</label>
                <div className="mt-1.5 flex flex-wrap gap-1.5">{(options?.browsers || []).slice(0, 6).map((b: any) => <button key={b.name} onClick={() => toggle("browsers", b.name)} className={chip(chosen("browsers", b.name))}>{b.name}</button>)}</div>
              </div>
            </div>

            <div>
              <label className={label}>Only people active in the last</label>
              <select className={`${input} mt-1 !w-auto`} value={audience.activeWithinDays} onChange={(e) => setAud({ activeWithinDays: Number(e.target.value) })}>
                <option value={0}>Any time</option><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Preview + send */}
        <div className="flex flex-col gap-4 xl:sticky xl:top-4">
          <div className={card}>
            <h2 className="text-sm font-bold text-content mb-3">Preview</h2>
            <div className="rounded-2xl bg-slate-100 p-3">
              <div className="rounded-xl bg-white shadow-sm p-3">
                <div className="flex items-start gap-2.5">
                  {(form.icon || site.icon) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={withBase(form.icon || site.icon)} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                  ) : <span className="h-8 w-8 rounded-lg bg-primary/10 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] text-slate-500 truncate">{site.siteName || "Your site"} · now</p>
                    <p className="text-sm font-semibold text-slate-900 break-words">{form.title || "Title goes here"}</p>
                    <p className="text-xs text-slate-600 break-words">{form.body || "Your message appears here."}</p>
                  </div>
                </div>
                {form.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={withBase(form.image)} alt="" className="mt-2 w-full rounded-lg object-cover max-h-32" />
                )}
                {(form.actions || []).filter((a: any) => a.title).length > 0 && (
                  <div className="mt-2 flex gap-4 border-t border-slate-200 pt-2">
                    {form.actions.filter((a: any) => a.title).map((a: any, i: number) => <span key={i} className="text-xs font-bold text-primary uppercase">{a.title}</span>)}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={`${card} flex flex-col gap-3`}>
            <div className="rounded-xl bg-surface-secondary px-3 py-2.5">
              <p className="text-xs text-content-secondary">This reaches</p>
              <p className="text-xl font-bold text-content tabular-nums">
                {reach === null ? <Loader2 className="h-4 w-4 animate-spin inline" /> : reach < 0 ? "—" : `${fmt(reach)} device${reach === 1 ? "" : "s"}`}
              </p>
            </div>
            <button onClick={() => submit("send")} disabled={!!busy || !form.title} className={btnPrimary}>
              {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send now
            </button>
            <div className="flex gap-2">
              <input type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
              <button onClick={() => submit("schedule")} disabled={!!busy || !form.title} className={btnGhost}><Clock className="h-4 w-4" /> Schedule</button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => submit("draft")} disabled={!!busy || !form.title} className={`${btnGhost} flex-1`}>{busy === "draft" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft</button>
              <button onClick={sendTest} disabled={!!busy || !form.title} className={`${btnGhost} flex-1`}>{busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube2 className="h-4 w-4" />} Test on me</button>
            </div>
            <p className="text-[12px] text-content-tertiary">A test goes only to your own browsers, and isn&apos;t counted in the campaign&apos;s results.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={null}>
      <Composer />
    </Suspense>
  );
}

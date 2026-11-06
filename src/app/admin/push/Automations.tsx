"use client";

/**
 * The automatic notifications: switch each one on or off and edit exactly what
 * it says. {placeholders} are filled in when it's sent, so nothing about the
 * brand or the wording is fixed in code.
 */
import React, { useState } from "react";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { card, input, btnPrimary, btnGhost, jsonFetch, Toggle } from "./ui";

type Type = { id: string; label: string; to: string; immediate: boolean; category: string; vars: string[] };

export function Automations({ data, reload }: { data: any; reload: () => void }) {
  const { toast } = useToast();
  const [cfg, setCfg] = useState<any>(data.config);
  const [saving, setSaving] = useState(false);
  const types: Type[] = data.types;
  const categories: { id: string; label: string }[] = data.categories;

  const setAuto = (id: string, patch: any) => setCfg((c: any) => ({ ...c, auto: { ...c.auto, [id]: { ...c.auto[id], ...patch } } }));
  const save = async () => {
    setSaving(true);
    const j = await jsonFetch("/api/admin/push/settings", { method: "PUT", body: JSON.stringify({ config: cfg }) });
    setSaving(false);
    j.success ? toast.success(j.message) : toast.error(j.message || "Couldn't save");
    reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="text-sm text-content-secondary max-w-2xl">
          These go out on their own. The ones set to <b>send straight away</b> go at once, day or night; the rest wait for quiet hours
          to end and count toward the daily limit (both in Settings). People can switch off whole groups in their account.
        </p>
        <button onClick={save} disabled={saving} className={btnPrimary}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button>
      </div>

      <div className="flex flex-col gap-3">
        {types.map((t) => {
          const a = cfg.auto[t.id] || { enabled: true, immediate: t.immediate, title: "", body: "" };
          const def = data.defaults.auto[t.id];
          const changed = def && (a.title !== def.title || a.body !== def.body);
          return (
            <div key={t.id} className={card}>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <Toggle
                  on={!!a.enabled}
                  onChange={(v) => setAuto(t.id, { enabled: v })}
                  label={t.label}
                  hint={`To: ${t.to} · group: ${categories.find((c) => c.id === t.category)?.label || t.category}${a.enabled ? (a.immediate ? " · sent straight away" : " · waits for quiet hours") : ""}`}
                />
                {changed && (
                  <button onClick={() => setAuto(t.id, { title: def.title, body: def.body })} className={`${btnGhost} !py-1.5 !px-3 text-xs`}><RotateCcw className="h-3.5 w-3.5" /> Reset text</button>
                )}
              </div>
              {a.enabled && (
                <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <div className="lg:col-span-2 rounded-xl bg-surface-secondary px-3 py-2.5">
                    <Toggle
                      on={!!a.immediate}
                      onChange={(v) => setAuto(t.id, { immediate: v })}
                      label="Send straight away"
                      hint="Goes at once, even during quiet hours, and doesn't count toward the daily limit. Use it for things people are waiting on."
                    />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-content-tertiary uppercase tracking-wider">Title</label>
                    <input className={`${input} mt-1`} value={a.title} maxLength={90} onChange={(e) => setAuto(t.id, { title: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-[12px] font-bold text-content-tertiary uppercase tracking-wider">Message</label>
                    <input className={`${input} mt-1`} value={a.body} maxLength={220} onChange={(e) => setAuto(t.id, { body: e.target.value })} />
                  </div>
                  <p className="lg:col-span-2 text-[12px] text-content-tertiary">
                    Placeholders: {["site", ...t.vars].map((v) => (
                      <button key={v} type="button" onClick={() => setAuto(t.id, { body: `${a.body}{${v}}` })} className="mr-1.5 rounded bg-surface-secondary px-1.5 py-0.5 font-mono hover:text-primary">{`{${v}}`}</button>
                    ))}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={save} disabled={saving} className={`${btnPrimary} self-start`}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes</button>
    </div>
  );
}

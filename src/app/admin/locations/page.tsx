"use client";

import React, { useEffect, useState } from "react";
import {
  MapPin, Plus, ChevronRight, ChevronDown, Pencil, Trash2, Loader2, X, Building2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";

const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""}`,
});

const inputCls =
  "bg-surface-secondary border border-card-border rounded-xl px-4 py-2.5 text-sm outline-none text-content focus:border-primary w-full";

interface City {
  _id: string; name: string; slug: string; stateName?: string;
  latitude?: number; longitude?: number; image?: string; featuredImage?: string;
  content?: string; order: number; isActive: boolean; listingCount: number; areaCount: number;
}
interface Area {
  _id: string; name: string; slug: string; cityId: string; isActive: boolean; listingCount: number;
  latitude?: number | string | null; longitude?: number | string | null;
}

export default function AdminLocationsPage() {
  const { toast } = useToast();
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [areas, setAreas] = useState<Record<string, Area[]>>({});

  const [cityModal, setCityModal] = useState<Partial<City> | null>(null);
  const [areaModal, setAreaModal] = useState<{ cityId: string; area: Partial<Area> } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadCities = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/cities", { headers: authH() });
      const json = await res.json();
      if (json.success) setCities(json.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadCities(); }, []);

  const loadAreas = async (cityId: string) => {
    const res = await fetch(`/api/admin/areas?cityId=${cityId}`, { headers: authH() });
    const json = await res.json();
    if (json.success) setAreas((p) => ({ ...p, [cityId]: json.data }));
  };

  const toggleExpand = (cityId: string) => {
    if (expanded === cityId) { setExpanded(null); return; }
    setExpanded(cityId);
    if (!areas[cityId]) loadAreas(cityId);
  };

  const saveCity = async () => {
    if (!cityModal?.name) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const editing = !!cityModal._id;
      const res = await fetch(editing ? `/api/admin/cities/${cityModal._id}` : "/api/admin/cities", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(cityModal),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); setCityModal(null); loadCities(); }
      else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const deleteCity = async (c: City) => {
    if (!confirm(`Delete "${c.name}" and all its areas?`)) return;
    const res = await fetch(`/api/admin/cities/${c._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); loadCities(); } else toast.error(json.message);
  };

  const saveArea = async () => {
    if (!areaModal?.area.name) { toast.error("Name required"); return; }
    setSaving(true);
    try {
      const editing = !!areaModal.area._id;
      const payload = { ...areaModal.area, cityId: areaModal.cityId };
      const res = await fetch(editing ? `/api/admin/areas/${areaModal.area._id}` : "/api/admin/areas", {
        method: editing ? "PUT" : "POST", headers: authH(), body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) { toast.success(json.message); loadAreas(areaModal.cityId); setAreaModal(null); loadCities(); }
      else toast.error(json.message);
    } finally { setSaving(false); }
  };

  const deleteArea = async (a: Area) => {
    if (!confirm(`Delete area "${a.name}"?`)) return;
    const res = await fetch(`/api/admin/areas/${a._id}`, { method: "DELETE", headers: authH() });
    const json = await res.json();
    if (json.success) { toast.success("Deleted"); loadAreas(a.cityId); loadCities(); } else toast.error(json.message);
  };

  const statusBadge = (active: boolean) =>
    active ? (
      <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-2 py-0.5 text-xs font-bold">Active</span>
    ) : (
      <span className="bg-zinc-50 text-zinc-500 border border-zinc-200 rounded px-2 py-0.5 text-xs font-bold">Hidden</span>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Locations</h1>
          <p className="text-xs text-content-secondary mt-1">Manage cities and areas.</p>
        </div>
        <button onClick={() => setCityModal({ isActive: true, order: 0 })}
          className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add City
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 text-primary animate-spin" /></div>
      ) : cities.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center text-sm text-content-secondary">
          No cities yet. Start with “Add City”.
        </div>
      ) : (
        <div className="bg-card border border-card-border rounded-2xl divide-y divide-card-border/60 overflow-hidden">
          {cities.map((c) => (
            <div key={c._id}>
              {/* City row */}
              <div className="flex items-center gap-3 px-4 py-3 hover:bg-surface-secondary/40">
                <button onClick={() => toggleExpand(c._id)} className="p-1 text-content-secondary">
                  {expanded === c._id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-content text-sm">{c.name}</span>{(c as any).source === "user" && <span className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px] font-semibold" title="Added by a seller while posting — check the spelling or merge it">Added by seller</span>}
                    {statusBadge(c.isActive)}
                  </div>
                  <span className="text-[12px] text-content-tertiary">
                    /{c.slug}{c.stateName ? ` · ${c.stateName}` : ""} · {c.areaCount} areas · {c.listingCount} ads
                  </span>
                </div>
                <button onClick={() => setAreaModal({ cityId: c._id, area: { isActive: true } })}
                  className="text-xs font-semibold text-primary hover:underline flex items-center gap-1">
                  <Plus className="h-3.5 w-3.5" /> Area
                </button>
                <button onClick={() => setCityModal(c)} className="p-1.5 rounded-lg border border-card-border hover:bg-surface-secondary text-content-secondary">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => deleteCity(c)} className="p-1.5 rounded-lg border border-card-border hover:bg-danger/10 text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Areas */}
              {expanded === c._id && (
                <div className="bg-surface-secondary/30 px-12 py-2">
                  {!areas[c._id] ? (
                    <div className="py-3 text-xs text-content-tertiary flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading areas…</div>
                  ) : areas[c._id].length === 0 ? (
                    <div className="py-3 text-xs text-content-tertiary">No areas yet. Add one with the “Area” button.</div>
                  ) : (
                    <div className="divide-y divide-card-border/50">
                      {areas[c._id].map((a) => (
                        <div key={a._id} className="flex items-center gap-3 py-2">
                          <Building2 className="h-3.5 w-3.5 text-content-tertiary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-content">{a.name}</span>{(a as any).source === "user" && <span className="ml-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 text-[11px] font-semibold" title="Added by a seller while posting">Added by seller</span>}
                            <span className="text-[12px] text-content-tertiary ml-2">/{a.slug} · {a.listingCount} ads</span>
                          </div>
                          {statusBadge(a.isActive)}
                          <button onClick={() => setAreaModal({ cityId: c._id, area: a })} className="p-1 rounded text-content-secondary hover:text-content"><Pencil className="h-3.5 w-3.5" /></button>
                          <button onClick={() => deleteArea(a)} className="p-1 rounded text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* City Modal */}
      {cityModal && (
        <Modal title={cityModal._id ? "Edit City" : "Add City"} onClose={() => setCityModal(null)} onSave={saveCity} saving={saving}>
          <Field label="Name *"><input className={inputCls} value={cityModal.name || ""} onChange={(e) => setCityModal({ ...cityModal, name: e.target.value })} /></Field>
          <Field label="Province / State"><input className={inputCls} value={cityModal.stateName || ""} onChange={(e) => setCityModal({ ...cityModal, stateName: e.target.value })} placeholder="e.g. Punjab" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><input className={inputCls} value={cityModal.latitude ?? ""} onChange={(e) => setCityModal({ ...cityModal, latitude: e.target.value as any })} /></Field>
            <Field label="Longitude"><input className={inputCls} value={cityModal.longitude ?? ""} onChange={(e) => setCityModal({ ...cityModal, longitude: e.target.value as any })} /></Field>
          </div>
          <ImageField label="City image" value={cityModal.image} onChange={(v) => setCityModal({ ...cityModal, image: v })} folder="locations" admin aspect="wide" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Order"><input type="number" className={inputCls} value={cityModal.order ?? 0} onChange={(e) => setCityModal({ ...cityModal, order: Number(e.target.value) })} /></Field>
            <Toggle label="Active" value={!!cityModal.isActive} onChange={(v) => setCityModal({ ...cityModal, isActive: v })} />
          </div>
          <Field label="SEO Content (HTML)"><textarea rows={3} className={inputCls} value={cityModal.content || ""} onChange={(e) => setCityModal({ ...cityModal, content: e.target.value })} /></Field>
        </Modal>
      )}

      {/* Area Modal */}
      {areaModal && (
        <Modal title={areaModal.area._id ? "Edit Area" : "Add Area"} onClose={() => setAreaModal(null)} onSave={saveArea} saving={saving}>
          <Field label="Name *"><input className={inputCls} value={areaModal.area.name || ""} onChange={(e) => setAreaModal({ ...areaModal, area: { ...areaModal.area, name: e.target.value } })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude"><input className={inputCls} value={(areaModal.area as any).latitude ?? ""} onChange={(e) => setAreaModal({ ...areaModal, area: { ...areaModal.area, latitude: e.target.value as any } })} placeholder="e.g. 31.4737" /></Field>
            <Field label="Longitude"><input className={inputCls} value={(areaModal.area as any).longitude ?? ""} onChange={(e) => setAreaModal({ ...areaModal, area: { ...areaModal.area, longitude: e.target.value as any } })} placeholder="e.g. 74.3921" /></Field>
          </div>
          <p className="text-[12px] text-content-tertiary -mt-1">Lat/Lng lets auto-detect route users to the nearest area.</p>
          <Toggle label="Active" value={!!areaModal.area.isActive} onChange={(v) => setAreaModal({ ...areaModal, area: { ...areaModal.area, isActive: v } })} />
        </Modal>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-content uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-5">
      <span className="text-xs font-bold text-content uppercase tracking-wider">{label}</span>
      <button type="button" onClick={() => onChange(!value)} className={`relative h-6 w-11 rounded-full transition-colors ${value ? "bg-primary" : "bg-surface-tertiary"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${value ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

function Modal({ title, children, onClose, onSave, saving }: { title: string; children: React.ReactNode; onClose: () => void; onSave: () => void; saving: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card border border-card-border rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h2 className="font-bold text-content">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-secondary"><X className="h-4.5 w-4.5 text-content-secondary" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">{children}</div>
        <div className="flex justify-end gap-3 px-5 py-4 border-t border-card-border">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium border border-card-border rounded-xl hover:bg-surface-secondary text-content">Cancel</button>
          <button onClick={onSave} disabled={saving} className="px-4 py-2 text-sm font-bold text-white bg-primary rounded-xl hover:bg-primary-dark disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      </div>
    </div>
  );
}

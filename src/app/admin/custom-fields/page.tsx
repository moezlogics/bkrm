"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Sliders,
  Search,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "decimal"
  | "dropdown"
  | "multiselect"
  | "checkbox"
  | "radio"
  | "boolean"
  | "date"
  | "range"
  | "year";

const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "decimal",
  "dropdown",
  "multiselect",
  "checkbox",
  "radio",
  "boolean",
  "date",
  "range",
  "year",
];

// Types that present a fixed option list to the user.
const OPTION_TYPES: FieldType[] = ["dropdown", "multiselect", "checkbox", "radio"];

interface CustomField {
  _id: string;
  name: string;
  slug: string;
  type: FieldType;
  required: boolean;
  values: string[];
  categoryIds: string[];
  status: boolean;
  unit?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  group?: string | null;
  sequence: number;
  filterable: boolean;
  searchable: boolean;
  urlFacet: boolean;
  min?: number | null;
  max?: number | null;
  dependsOnSlug?: string | null;
  allowCustom?: boolean;
  userAddedValues?: string[];
}

interface FlatCategory {
  _id: string;
  name: string;
  parentCategoryId: string | null;
  depth: number;
}

// ────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────
const authH = () => ({
  "Content-Type": "application/json",
  Authorization:
    "Bearer " + (typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""),
});

// Flatten the raw (flat) category list into a depth-ordered tree for indentation.
function flattenCategories(raw: any[]): FlatCategory[] {
  const byParent: Record<string, any[]> = {};
  raw.forEach((c) => {
    const key = c.parentCategoryId ? String(c.parentCategoryId) : "root";
    (byParent[key] ||= []).push(c);
  });

  const out: FlatCategory[] = [];
  const walk = (parentKey: string, depth: number) => {
    const children = (byParent[parentKey] || []).sort(
      (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.name.localeCompare(b.name)
    );
    children.forEach((c) => {
      out.push({
        _id: String(c._id),
        name: c.name,
        parentCategoryId: c.parentCategoryId ? String(c.parentCategoryId) : null,
        depth,
      });
      walk(String(c._id), depth + 1);
    });
  };
  walk("root", 0);

  // Catch orphans whose parents aren't present in the list.
  const seen = new Set(out.map((o) => o._id));
  raw.forEach((c) => {
    if (!seen.has(String(c._id))) {
      out.push({
        _id: String(c._id),
        name: c.name,
        parentCategoryId: c.parentCategoryId ? String(c.parentCategoryId) : null,
        depth: 0,
      });
    }
  });

  return out;
}

const emptyForm = () => ({
  name: "",
  type: "text" as FieldType,
  categoryIds: [] as string[],
  required: false,
  valuesText: "",
  unit: "",
  placeholder: "",
  helpText: "",
  group: "",
  sequence: 0 as number | string,
  filterable: false,
  searchable: false,
  urlFacet: false,
  min: "" as number | string,
  max: "" as number | string,
  dependsOnSlug: "",
  status: true,
  allowCustom: true,
  userAddedValues: [] as string[],
});

type FormState = ReturnType<typeof emptyForm>;

// ────────────────────────────────────────────
// Toggle (reusable)
// ────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-3 w-full text-left"
    >
      <span className="text-sm font-semibold text-content">{label}</span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? "bg-primary" : "bg-surface-secondary border border-card-border"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

// ────────────────────────────────────────────
// Badges
// ────────────────────────────────────────────
function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "emerald" | "amber" | "rose" | "zinc" | "blue";
}) {
  const tones: Record<string, string> = {
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-200",
    amber: "bg-amber-50 text-amber-600 border-amber-200",
    rose: "bg-rose-50 text-rose-600 border-rose-200",
    zinc: "bg-zinc-50 text-zinc-600 border-zinc-200",
    blue: "bg-blue-50 text-blue-600 border-blue-200",
  };
  return (
    <span className={`inline-block border rounded px-2 py-1 text-xs font-bold ${tones[tone]}`}>
      {children}
    </span>
  );
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────
export default function AdminCustomFieldsPage() {
  const { toast } = useToast();

  const [fields, setFields] = useState<CustomField[]>([]);
  const [categories, setCategories] = useState<FlatCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  // ── Category name lookup ──
  const categoryNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    categories.forEach((c) => (m[c._id] = c.name));
    return m;
  }, [categories]);

  // ── Data fetching ──
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [fieldsRes, catsRes] = await Promise.all([
        fetch("/api/custom-fields?activeOnly=false", { headers: authH() }),
        fetch("/api/categories?tree=false", { headers: authH() }),
      ]);
      const fieldsJson = await fieldsRes.json();
      const catsJson = await catsRes.json();

      if (fieldsJson.success) {
        setFields(
          (fieldsJson.data || []).map((f: any) => ({
            ...f,
            categoryIds: (f.categoryIds || []).map((c: any) => String(c)),
          }))
        );
      } else {
        toast.error(fieldsJson.message || "Failed to load custom fields");
      }

      if (catsJson.success) {
        setCategories(flattenCategories(catsJson.data || []));
      } else {
        toast.error(catsJson.message || "Failed to load categories");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error while loading data");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Modal control ──
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (f: CustomField) => {
    setEditingId(f._id);
    setForm({
      name: f.name,
      type: f.type,
      categoryIds: f.categoryIds || [],
      required: !!f.required,
      valuesText: (f.values || []).join("\n"),
      unit: f.unit || "",
      placeholder: f.placeholder || "",
      helpText: f.helpText || "",
      group: f.group || "",
      sequence: f.sequence ?? 0,
      filterable: !!f.filterable,
      searchable: !!f.searchable,
      urlFacet: !!f.urlFacet,
      min: f.min ?? "",
      max: f.max ?? "",
      dependsOnSlug: f.dependsOnSlug || "",
      status: !!f.status,
      allowCustom: f.allowCustom !== false,
      userAddedValues: f.userAddedValues || [],
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
  };

  const toggleCategory = (id: string) => {
    setForm((prev) => ({
      ...prev,
      categoryIds: prev.categoryIds.includes(id)
        ? prev.categoryIds.filter((c) => c !== id)
        : [...prev.categoryIds, id],
    }));
  };

  // ── Submit (create / update) ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Field name is required");
      return;
    }

    const showOptions = OPTION_TYPES.includes(form.type);
    const payload = {
      name: form.name.trim(),
      type: form.type,
      categoryIds: form.categoryIds,
      required: form.required,
      values: showOptions
        ? form.valuesText
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean)
        : [],
      unit: form.unit.trim(),
      placeholder: form.placeholder.trim(),
      helpText: form.helpText.trim(),
      group: form.group.trim(),
      sequence: form.sequence === "" ? 0 : Number(form.sequence),
      filterable: form.filterable,
      searchable: form.searchable,
      urlFacet: form.urlFacet,
      min: form.min === "" ? null : Number(form.min),
      max: form.max === "" ? null : Number(form.max),
      dependsOnSlug: form.dependsOnSlug.trim(),
      allowCustom: form.allowCustom,
      status: form.status,
    };

    setSaving(true);
    try {
      const url = editingId ? `/api/custom-fields/${editingId}` : "/api/custom-fields";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authH(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(editingId ? "Custom field updated" : "Custom field created");
        setModalOpen(false);
        fetchData();
      } else {
        toast.error(json.message || "Failed to save custom field");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error while saving");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (f: CustomField) => {
    if (!window.confirm(`Delete custom field "${f.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/custom-fields/${f._id}`, {
        method: "DELETE",
        headers: authH(),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Custom field deleted");
        setFields((prev) => prev.filter((x) => x._id !== f._id));
      } else {
        toast.error(json.message || "Failed to delete custom field");
      }
    } catch (e: any) {
      toast.error(e.message || "Network error while deleting");
    }
  };

  // ── Filtered rows ──
  const visibleFields = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return fields;
    return fields.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.slug.toLowerCase().includes(q) ||
        (f.group || "").toLowerCase().includes(q)
    );
  }, [fields, search]);

  const showOptions = OPTION_TYPES.includes(form.type);

  // ────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">Custom Fields</h1>
          <p className="text-xs text-content-secondary mt-1">
            Dynamic per-category attributes that power the post wizard, filters and facet URLs.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Field
        </button>
      </div>

      {/* Search bar */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, slug or group..."
          className="w-full bg-surface-secondary border border-card-border rounded-xl pl-10 pr-4 py-3 text-sm outline-none text-content focus:border-primary"
        />
      </div>

      {/* Table card */}
      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
            <span className="text-sm font-semibold text-content-secondary">
              Loading custom fields...
            </span>
          </div>
        ) : visibleFields.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <Sliders className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-content">
              {search ? "No fields match your search" : "No custom fields yet"}
            </h3>
            <p className="text-sm text-content-secondary max-w-sm">
              {search
                ? "Try a different keyword."
                : "Create your first custom field to start collecting structured attributes on listings."}
            </p>
            {!search && (
              <button
                onClick={openCreate}
                className="mt-2 inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
              >
                <Plus className="h-4 w-4" /> Add Field
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Unit</th>
                  <th className="py-3 px-4">Group</th>
                  <th className="py-3 px-4">Categories</th>
                  <th className="py-3 px-4">Flags</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50 text-content">
                {visibleFields.map((f) => {
                  const catNames = (f.categoryIds || [])
                    .map((id) => categoryNameMap[id])
                    .filter(Boolean);
                  return (
                    <tr key={f._id} className="hover:bg-surface-secondary/30 transition-colors">
                      <td className="py-4 px-4 font-semibold">{f.name}</td>
                      <td className="py-4 px-4 text-content-secondary font-mono text-xs">
                        {f.slug}
                      </td>
                      <td className="py-4 px-4">
                        <span className="bg-surface-secondary border border-card-border px-2 py-0.5 rounded text-xs font-semibold">
                          {f.type}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-content-secondary">{f.unit || "—"}</td>
                      <td className="py-4 px-4 text-content-secondary">{f.group || "—"}</td>
                      <td className="py-4 px-4">
                        {catNames.length === 0 ? (
                          <span className="text-xs text-content-tertiary">All / none</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 max-w-[220px]">
                            {catNames.slice(0, 3).map((n, i) => (
                              <span
                                key={i}
                                className="bg-surface-secondary border border-card-border px-2 py-0.5 rounded text-xs"
                              >
                                {n}
                              </span>
                            ))}
                            {catNames.length > 3 && (
                              <span className="text-xs text-content-tertiary self-center">
                                +{catNames.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap gap-1">
                          {f.required && <Badge tone="amber">Required</Badge>}
                          {f.filterable && <Badge tone="blue">Filterable</Badge>}
                          {!f.required && !f.filterable && (
                            <span className="text-xs text-content-tertiary">—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        {f.status ? (
                          <Badge tone="emerald">Active</Badge>
                        ) : (
                          <Badge tone="zinc">Inactive</Badge>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(f)}
                            className="p-2 rounded-lg border border-card-border hover:bg-surface-secondary text-content transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(f)}
                            className="p-2 rounded-lg border border-card-border hover:bg-rose-50 text-danger transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-10"
          onMouseDown={closeModal}
        >
          <div
            className="bg-card border border-card-border rounded-2xl shadow-sm w-full max-w-3xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-card-border px-6 py-4">
              <h2 className="text-lg font-bold text-content">
                {editingId ? "Edit Custom Field" : "Add Custom Field"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-surface-secondary text-content-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 py-5 grid grid-cols-1 md:grid-cols-2 gap-5 max-h-[70vh] overflow-y-auto">
                {/* Name */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Make, Bedrooms, Mileage"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Type
                  </label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as FieldType })}
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary capitalize"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Values (option types only) */}
                {showOptions && (
                  <div className="flex flex-col gap-1.5 md:col-span-2">
                    <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                      Options (one per line)
                    </label>
                    <textarea
                      value={form.valuesText}
                      onChange={(e) => setForm({ ...form, valuesText: e.target.value })}
                      rows={4}
                      placeholder={"Toyota\nHonda\nSuzuki"}
                      className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary resize-y"
                    />
                    {form.userAddedValues.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-content-secondary">
                        <span className="font-semibold">Added by sellers:</span>
                        {form.userAddedValues.map((v) => (
                          <span key={v} className="rounded-full bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5">{v}</span>
                        ))}
                        <span className="text-content-tertiary">— edit or delete them in the list above.</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Categories multi-select */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Categories
                  </label>
                  <div className="bg-surface-secondary border border-card-border rounded-xl p-3 max-h-48 overflow-y-auto flex flex-col gap-0.5">
                    {categories.length === 0 ? (
                      <span className="text-xs text-content-tertiary py-2">
                        No categories available.
                      </span>
                    ) : (
                      categories.map((c) => (
                        <label
                          key={c._id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-card cursor-pointer"
                          style={{ paddingLeft: `${8 + c.depth * 18}px` }}
                        >
                          <input
                            type="checkbox"
                            checked={form.categoryIds.includes(c._id)}
                            onChange={() => toggleCategory(c._id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm text-content">{c.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                  <span className="text-xs text-content-tertiary">
                    Leave empty to apply globally. {form.categoryIds.length} selected.
                  </span>
                </div>

                {/* Unit */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    placeholder="km, cc, Marla, sq ft"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Group */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Group
                  </label>
                  <input
                    type="text"
                    value={form.group}
                    onChange={(e) => setForm({ ...form, group: e.target.value })}
                    placeholder="Engine, Location, Details"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Placeholder */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Placeholder
                  </label>
                  <input
                    type="text"
                    value={form.placeholder}
                    onChange={(e) => setForm({ ...form, placeholder: e.target.value })}
                    placeholder="Shown inside the empty input"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Sequence */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Sequence
                  </label>
                  <input
                    type="number"
                    value={form.sequence}
                    onChange={(e) => setForm({ ...form, sequence: e.target.value })}
                    placeholder="0"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Help text */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Help Text
                  </label>
                  <input
                    type="text"
                    value={form.helpText}
                    onChange={(e) => setForm({ ...form, helpText: e.target.value })}
                    placeholder="Hint displayed under the field"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Min */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Min
                  </label>
                  <input
                    type="number"
                    value={form.min}
                    onChange={(e) => setForm({ ...form, min: e.target.value })}
                    placeholder="Numeric / range / year"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Max */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Max
                  </label>
                  <input
                    type="number"
                    value={form.max}
                    onChange={(e) => setForm({ ...form, max: e.target.value })}
                    placeholder="Numeric / range / year"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>

                {/* Depends on slug */}
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Depends On (field slug)
                  </label>
                  <input
                    type="text"
                    value={form.dependsOnSlug}
                    onChange={(e) => setForm({ ...form, dependsOnSlug: e.target.value })}
                    placeholder="e.g. make (this field's options depend on it)"
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary font-mono"
                  />
                </div>

                {/* Toggles */}
                <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 bg-surface-secondary border border-card-border rounded-xl p-4">
                  <Toggle
                    label="Required"
                    checked={form.required}
                    onChange={(v) => setForm({ ...form, required: v })}
                  />
                  <Toggle
                    label="Active (status)"
                    checked={form.status}
                    onChange={(v) => setForm({ ...form, status: v })}
                  />
                  <Toggle
                    label="Filterable"
                    checked={form.filterable}
                    onChange={(v) => setForm({ ...form, filterable: v })}
                  />
                  <Toggle
                    label="Searchable"
                    checked={form.searchable}
                    onChange={(v) => setForm({ ...form, searchable: v })}
                  />
                  <Toggle
                    label="URL Facet"
                    checked={form.urlFacet}
                    onChange={(v) => setForm({ ...form, urlFacet: v })}
                  />
                  {showOptions && (
                    <Toggle
                      label="Sellers can add their own option"
                      checked={form.allowCustom}
                      onChange={(v) => setForm({ ...form, allowCustom: v })}
                    />
                  )}
                </div>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 border-t border-card-border px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="border border-card-border hover:bg-surface-secondary text-content font-bold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-5 py-2.5 text-sm transition-colors disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Field"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

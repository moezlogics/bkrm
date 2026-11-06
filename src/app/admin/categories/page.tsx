"use client";

import { ImageField } from "@/components/media/ImageField";
import { CATEGORY_ICONS } from "@/lib/category-icons";

import React, { useState, useEffect, useCallback } from "react";
import {
  FolderTree,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
  X,
  Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";

// ────────────────────────────────────────────
// Types
// ────────────────────────────────────────────
interface CategoryNode {
  _id: string;
  name: string;
  slug: string;
  image?: string | null;
  icon?: string | null;
  sequence?: number;
  parentCategoryId?: string | null;
  description?: string | null;
  status: boolean;
  listingType: string;
  priceMode: string;
  conditionSet: string[];
  showCondition: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
  children: CategoryNode[];
}

interface FlatOption {
  _id: string;
  label: string;
}

interface FormState {
  name: string;
  parentCategoryId: string;
  image: string;
  icon: string;
  sequence: string;
  status: boolean;
  listingType: string;
  priceMode: string;
  conditionSet: string; // comma-separated
  showCondition: boolean;
  description: string;
  seoTitle: string;
  seoDescription: string;
}

const LISTING_TYPES = ["item", "vehicle", "property", "job", "service"];
const PRICE_MODES = [
  "fixed",
  "negotiable",
  "free",
  "contact",
  "range",
  "salary",
  "none",
];

const emptyForm = (): FormState => ({
  name: "",
  parentCategoryId: "",
  image: "",
  icon: "",
  sequence: "0",
  status: true,
  listingType: "item",
  priceMode: "fixed",
  conditionSet: "used, new",
  showCondition: true,
  description: "",
  seoTitle: "",
  seoDescription: "",
});

// Bearer-token authenticated headers
const authH = () => ({
  "Content-Type": "application/json",
  Authorization:
    "Bearer " +
    (typeof window !== "undefined"
      ? localStorage.getItem("auth_token")
      : ""),
});

// Build a flat, indented option list from the tree (for the parent select)
function flattenForOptions(
  nodes: CategoryNode[],
  depth = 0,
  acc: FlatOption[] = []
): FlatOption[] {
  for (const node of nodes) {
    acc.push({
      _id: node._id,
      label: `${"    ".repeat(depth)}${
        depth > 0 ? "└ " : ""
      }${node.name}`,
    });
    if (node.children && node.children.length > 0) {
      flattenForOptions(node.children, depth + 1, acc);
    }
  }
  return acc;
}

// ────────────────────────────────────────────
// Status badge
// ────────────────────────────────────────────
function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded border border-emerald-200">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center text-xs font-bold text-zinc-600 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 rounded border border-zinc-200">
      Hidden
    </span>
  );
}

// ────────────────────────────────────────────
// Page
// ────────────────────────────────────────────
export default function AdminCategoriesPage() {
  const { toast } = useToast();

  const [tree, setTree] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());

  // ── Fetch tree ──
  const fetchTree = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/categories", { headers: authH() });
      const json = await res.json();
      if (json.success) {
        setTree(json.data || []);
      } else {
        toast.error(json.message || "Failed to load categories");
      }
    } catch (err: any) {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTree();
  }, [fetchTree]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // ── Modal openers ──
  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (node: CategoryNode) => {
    setEditingId(node._id);
    setForm({
      name: node.name || "",
      parentCategoryId: node.parentCategoryId
        ? String(node.parentCategoryId)
        : "",
      image: node.image || "",
      icon: node.icon || "",
      sequence: String(node.sequence ?? 0),
      status: node.status !== false,
      listingType: node.listingType || "item",
      priceMode: node.priceMode || "fixed",
      conditionSet: (node.conditionSet || []).join(", "),
      showCondition: node.showCondition !== false,
      description: node.description || "",
      seoTitle: node.seoTitle || "",
      seoDescription: node.seoDescription || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
  };

  // ── Save (create or update) ──
  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      parentCategoryId: form.parentCategoryId || null,
      image: form.image.trim() || null,
      icon: form.icon.trim() || null,
      sequence: Number(form.sequence) || 0,
      status: form.status,
      listingType: form.listingType,
      priceMode: form.priceMode,
      conditionSet: form.conditionSet
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
      showCondition: form.showCondition,
      description: form.description.trim(),
      seoTitle: form.seoTitle.trim() || null,
      seoDescription: form.seoDescription.trim() || null,
    };

    try {
      const url = editingId
        ? `/api/categories/${editingId}`
        : "/api/categories";
      const method = editingId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: authH(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(
          editingId ? "Category updated" : "Category created"
        );
        setModalOpen(false);
        setEditingId(null);
        await fetchTree();
      } else {
        toast.error(json.message || "Save failed");
      }
    } catch (err: any) {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ──
  const handleDelete = async (node: CategoryNode) => {
    if (
      !window.confirm(
        `Delete "${node.name}"? Its child categories will be re-linked to the parent.`
      )
    )
      return;

    try {
      const res = await fetch(`/api/categories/${node._id}`, {
        method: "DELETE",
        headers: authH(),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Category deleted");
        await fetchTree();
      } else {
        toast.error(json.message || "Delete failed");
      }
    } catch (err: any) {
      toast.error("Delete failed");
    }
  };

  // Parent options exclude the category being edited (cannot parent itself).
  const parentOptions = flattenForOptions(tree).filter(
    (o) => o._id !== editingId
  );

  // ── Recursive row renderer ──
  const renderRows = (nodes: CategoryNode[], depth = 0): React.ReactNode =>
    nodes.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isOpen = !!expanded[node._id];
      return (
        <React.Fragment key={node._id}>
          <tr className="hover:bg-surface-secondary/30 transition-colors">
            {/* Name + expand control + thumb */}
            <td className="py-4 px-4">
              <div
                className="flex items-center gap-3"
                style={{ paddingLeft: depth * 24 }}
              >
                {hasChildren ? (
                  <button
                    onClick={() => toggleExpand(node._id)}
                    className="p-0.5 rounded hover:bg-surface-secondary text-content-secondary shrink-0"
                    aria-label={isOpen ? "Collapse" : "Expand"}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : (
                  <span className="w-5 shrink-0" />
                )}

                {/* Thumb (image > icon glyph > placeholder) */}
                {node.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={node.image}
                    alt={node.name}
                    className="h-9 w-9 rounded-lg object-cover border border-card-border shrink-0"
                  />
                ) : node.icon ? (
                  <span className="h-9 w-9 rounded-lg border border-card-border bg-surface-secondary flex items-center justify-center text-base shrink-0">
                    {node.icon.length <= 2 ? node.icon : node.icon.charAt(0)}
                  </span>
                ) : (
                  <span className="h-9 w-9 rounded-lg border border-card-border bg-surface-secondary flex items-center justify-center text-content-tertiary shrink-0">
                    <ImageIcon className="h-4 w-4" />
                  </span>
                )}

                <span className="font-semibold text-content">
                  {node.name}
                </span>
              </div>
            </td>

            {/* Slug */}
            <td className="py-4 px-4 text-xs text-content-secondary font-mono">
              {node.slug}
            </td>

            {/* Listing type chip */}
            <td className="py-4 px-4">
              <span className="bg-surface-secondary border border-card-border px-2 py-0.5 rounded text-xs font-bold text-content-secondary capitalize">
                {node.listingType}
              </span>
            </td>

            {/* Status */}
            <td className="py-4 px-4">
              <StatusBadge active={node.status !== false} />
            </td>

            {/* Actions */}
            <td className="py-4 px-4">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => openEdit(node)}
                  className="inline-flex items-center gap-1 border border-card-border hover:bg-surface-secondary text-content rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => handleDelete(node)}
                  className="inline-flex items-center gap-1 border border-card-border hover:bg-danger/10 text-danger rounded-xl px-3 py-1.5 text-xs font-bold transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </td>
          </tr>
          {hasChildren && isOpen && renderRows(node.children, depth + 1)}
        </React.Fragment>
      );
    });

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">
            Categories
          </h1>
          <p className="text-xs text-content-secondary mt-1">
            Manage the hierarchical category tree and per-category posting
            config.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" /> Add Category
        </button>
      </div>

      {/* Tree table */}
      <div className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="text-sm font-semibold text-content-secondary">
              Loading categories...
            </span>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center px-6">
            <div className="h-14 w-14 rounded-2xl bg-surface-secondary flex items-center justify-center">
              <FolderTree className="h-7 w-7 text-content-tertiary" />
            </div>
            <h3 className="text-base font-bold text-content">
              No categories yet
            </h3>
            <p className="text-sm text-content-secondary max-w-sm">
              Create your first root category to start building the catalog
              tree.
            </p>
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors mt-2"
            >
              <Plus className="h-4 w-4" /> Add Category
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-card-border text-xs text-content-secondary font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Slug</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-card-border/50 text-content">
                {renderRows(tree)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-card border border-card-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
              <h2 className="text-lg font-bold text-content">
                {editingId ? "Edit Category" : "Add Category"}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg hover:bg-surface-secondary text-content-secondary transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Name <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="e.g. Spare Parts"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
              </div>

              {/* Parent */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Parent Category
                </label>
                <select
                  value={form.parentCategoryId}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      parentCategoryId: e.target.value,
                    }))
                  }
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                >
                  <option value="">— None (root)</option>
                  {parentOptions.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Image + Icon */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ImageField
                  label="Category image (optional)"
                  value={form.image}
                  onChange={(v) => setForm((f) => ({ ...f, image: v }))}
                  folder="categories"
                  admin
                  aspect="square"
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Icon
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.entries(CATEGORY_ICONS).map(([key, { label, Icon }]) => (
                      <button
                        key={key}
                        type="button"
                        title={label}
                        onClick={() => setForm((f) => ({ ...f, icon: key }))}
                        className={`aspect-square rounded-lg border grid place-items-center transition-colors ${form.icon === key ? "border-primary bg-primary/10 text-primary" : "border-card-border text-content-secondary hover:border-primary"}`}
                      >
                        <Icon className="h-5 w-5" />
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-content-tertiary">
                    {form.icon && (CATEGORY_ICONS as any)[form.icon] ? (CATEGORY_ICONS as any)[form.icon].label : "Shown on the homepage tiles and in the sell flow."}
                  </p>
                </div>
              </div>

              {/* Sequence + Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Sequence
                  </label>
                  <input
                    type="number"
                    value={form.sequence}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sequence: e.target.value }))
                    }
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Status
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) => ({ ...f, status: !f.status }))
                    }
                    className="flex items-center gap-3 bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm text-content"
                  >
                    <span
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        form.status ? "bg-primary" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          form.status ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </span>
                    <span className="font-semibold">
                      {form.status ? "Active" : "Hidden"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Listing type + Price mode */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Listing Type
                  </label>
                  <select
                    value={form.listingType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, listingType: e.target.value }))
                    }
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary capitalize"
                  >
                    {LISTING_TYPES.map((t) => (
                      <option key={t} value={t} className="capitalize">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                    Price Mode
                  </label>
                  <select
                    value={form.priceMode}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, priceMode: e.target.value }))
                    }
                    className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary capitalize"
                  >
                    {PRICE_MODES.map((p) => (
                      <option key={p} value={p} className="capitalize">
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Condition set + show condition */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Condition Set
                </label>
                <input
                  type="text"
                  value={form.conditionSet}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, conditionSet: e.target.value }))
                  }
                  placeholder="used, new"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
                <p className="text-[11px] text-content-tertiary">
                  Comma-separated. Leave empty for verticals with no condition
                  (Jobs/Property).
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Show Condition
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      showCondition: !f.showCondition,
                    }))
                  }
                  className="flex items-center gap-3 bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm text-content w-fit"
                >
                  <span
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.showCondition ? "bg-primary" : "bg-zinc-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        form.showCondition
                          ? "translate-x-6"
                          : "translate-x-1"
                      }`}
                    />
                  </span>
                  <span className="font-semibold">
                    {form.showCondition ? "Shown" : "Hidden"}
                  </span>
                </button>
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={3}
                  placeholder="Short description shown on the category hub."
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary resize-y"
                />
              </div>

              {/* SEO */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  SEO Title
                </label>
                <input
                  type="text"
                  value={form.seoTitle}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, seoTitle: e.target.value }))
                  }
                  placeholder="Page <title> for the category hub"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  SEO Description
                </label>
                <textarea
                  value={form.seoDescription}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      seoDescription: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="Meta description for search engines"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary resize-y"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-card-border">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="border border-card-border hover:bg-surface-secondary text-content font-bold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

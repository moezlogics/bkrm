"use client";

import React, { useEffect, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  ImageOff,
  Link2,
  GalleryHorizontalEnd,
  Loader2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { ImageField } from "@/components/media/ImageField";

interface Slider {
  _id: string;
  image: string;
  sequence: number;
  thirdPartyLink?: string | null;
  itemId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface SliderForm {
  image: string;
  sequence: string;
  thirdPartyLink: string;
  itemId: string;
}

const emptyForm: SliderForm = {
  image: "",
  sequence: "0",
  thirdPartyLink: "",
  itemId: "",
};

const authH = () => ({
  "Content-Type": "application/json",
  Authorization:
    "Bearer " +
    (typeof window !== "undefined" ? localStorage.getItem("auth_token") : ""),
});

export default function AdminSlidersPage() {
  const { toast } = useToast();

  const [sliders, setSliders] = useState<Slider[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SliderForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchSliders = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/sliders", { headers: authH() });
      const json = await res.json();
      if (json.success) {
        setSliders(json.data || []);
      } else {
        toast.error(json.message || "Failed to load sliders");
      }
    } catch {
      toast.error("Something went wrong while loading sliders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSliders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (slider: Slider) => {
    setEditingId(slider._id);
    setForm({
      image: slider.image || "",
      sequence: String(slider.sequence ?? 0),
      thirdPartyLink: slider.thirdPartyLink || "",
      itemId: slider.itemId || "",
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.image.trim()) {
      toast.error("Please add a banner image");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        image: form.image.trim(),
        sequence: Number(form.sequence) || 0,
        thirdPartyLink: form.thirdPartyLink.trim() || null,
        itemId: form.itemId.trim() || null,
      };

      const url = editingId
        ? `/api/admin/sliders/${editingId}`
        : "/api/admin/sliders";
      const method = editingId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: authH(),
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (json.success) {
        toast.success(
          editingId ? "Slider updated" : "Slider created successfully"
        );
        closeModal();
        fetchSliders();
      } else {
        toast.error(json.message || "Failed to save slider");
      }
    } catch {
      toast.error("Something went wrong while saving");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (slider: Slider) => {
    if (
      !window.confirm(
        "Delete this slider? This will remove it from the homepage carousel."
      )
    )
      return;

    try {
      const res = await fetch(`/api/admin/sliders/${slider._id}`, {
        method: "DELETE",
        headers: authH(),
      });
      const json = await res.json();
      if (json.success) {
        toast.success("Slider deleted");
        setSliders((prev) => prev.filter((s) => s._id !== slider._id));
      } else {
        toast.error(json.message || "Failed to delete slider");
      }
    } catch {
      toast.error("Something went wrong while deleting");
    }
  };

  return (
    <div className="flex flex-col gap-8">
      {/* Page Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-content tracking-tight">
            Homepage Sliders
          </h1>
          <p className="text-xs text-content-secondary mt-1">
            Manage the homepage carousel banners. Lower sequence numbers appear
            first.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
        >
          <Plus className="h-4 w-4" /> Add Slider
        </button>
      </div>

      {/* Body */}
      {loading ? (
        <div className="bg-card border border-card-border rounded-2xl shadow-sm p-16 flex flex-col items-center justify-center gap-3 text-content-secondary">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <span className="text-sm">Loading sliders...</span>
        </div>
      ) : sliders.length === 0 ? (
        <div className="bg-card border border-card-border rounded-2xl shadow-sm p-16 flex flex-col items-center justify-center gap-3 text-center">
          <div className="h-14 w-14 rounded-2xl bg-surface-secondary flex items-center justify-center">
            <GalleryHorizontalEnd className="h-7 w-7 text-content-secondary" />
          </div>
          <h3 className="text-base font-bold text-content">No sliders yet</h3>
          <p className="text-xs text-content-secondary max-w-sm">
            Add your first homepage banner to start building the carousel.
          </p>
          <button
            onClick={openAdd}
            className="mt-2 inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> Add Slider
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {sliders.map((slider) => (
            <div
              key={slider._id}
              className="bg-card border border-card-border rounded-2xl shadow-sm overflow-hidden flex flex-col"
            >
              {/* Image preview */}
              <div className="relative aspect-[16/7] bg-surface-secondary">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slider.image}
                  alt={`Slider ${slider.sequence}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const fallback = e.currentTarget
                      .nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div
                  className="absolute inset-0 hidden flex-col items-center justify-center gap-1 text-content-secondary"
                  style={{ display: "none" }}
                >
                  <ImageOff className="h-6 w-6" />
                  <span className="text-xs">Image unavailable</span>
                </div>
                {/* Sequence badge */}
                <span className="absolute top-2 left-2 bg-zinc-50 text-zinc-600 border border-zinc-200 rounded px-2 py-1 text-xs font-bold">
                  #{slider.sequence}
                </span>
              </div>

              {/* Meta + actions */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex flex-col gap-2 flex-1">
                  {slider.thirdPartyLink ? (
                    <a
                      href={slider.thirdPartyLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold truncate"
                      title={slider.thirdPartyLink}
                    >
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{slider.thirdPartyLink}</span>
                    </a>
                  ) : slider.itemId ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-content-secondary font-semibold">
                      <Link2 className="h-3.5 w-3.5 shrink-0" />
                      Links to listing
                    </span>
                  ) : (
                    <span className="text-xs text-content-secondary">
                      No link configured
                    </span>
                  )}

                  <div>
                    <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 rounded px-2 py-1 text-xs font-bold">
                      Active
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-card-border">
                  <button
                    onClick={() => openEdit(slider)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 border border-card-border hover:bg-surface-secondary text-content rounded-xl px-3 py-2 text-xs font-bold transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(slider)}
                    className="inline-flex items-center justify-center gap-1.5 border border-card-border hover:bg-surface-secondary text-danger rounded-xl px-3 py-2 text-xs font-bold transition-colors"
                    title="Delete slider"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-card border border-card-border rounded-2xl shadow-sm w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-card-border">
              <h2 className="text-base font-bold text-content">
                {editingId ? "Edit Slider" : "Add Slider"}
              </h2>
              <button
                onClick={closeModal}
                className="text-content-secondary hover:text-content transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-5">
              <ImageField
                label="Banner image *"
                value={form.image}
                onChange={(v) => setForm({ ...form, image: v })}
                folder="sliders"
                admin
                aspect="banner"
                hint="Wide image, about 1600 × 600. Upload from your computer or pick from the media library."
              />

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Sequence
                </label>
                <input
                  type="number"
                  value={form.sequence}
                  onChange={(e) =>
                    setForm({ ...form, sequence: e.target.value })
                  }
                  placeholder="0"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
                <p className="text-xs text-content-secondary">
                  Lower numbers appear first in the carousel.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Third-party Link
                </label>
                <input
                  type="text"
                  value={form.thirdPartyLink}
                  onChange={(e) =>
                    setForm({ ...form, thirdPartyLink: e.target.value })
                  }
                  placeholder="https://example.com (optional)"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
                <p className="text-xs text-content-secondary">
                  External URL to open when the banner is clicked.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-content-secondary uppercase tracking-wider">
                  Listing ID
                </label>
                <input
                  type="text"
                  value={form.itemId}
                  onChange={(e) =>
                    setForm({ ...form, itemId: e.target.value })
                  }
                  placeholder="Listing ObjectId (optional)"
                  className="bg-surface-secondary border border-card-border rounded-xl px-4 py-3 text-sm outline-none text-content focus:border-primary"
                />
                <p className="text-xs text-content-secondary">
                  Deep-link to an internal listing instead of an external URL.
                </p>
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-end gap-3 pt-2">
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
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? "Save Changes" : "Create Slider"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

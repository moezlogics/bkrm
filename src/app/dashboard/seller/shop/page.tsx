"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { AppBar } from "@/components/layout/AppChrome";
import { ImageField } from "@/components/media/ImageField";
import { VERTICAL } from "@/vertical";

export default function ShopRegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [shopName, setShopName] = useState("");
  const [shopAddress, setShopAddress] = useState("");
  const [shopLogo, setShopLogo] = useState("");
  const [shopBanner, setShopBanner] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [canRegister, setCanRegister] = useState(false);
  const [shopSlug, setShopSlug] = useState<string | null>(null);

  const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("auth_token")}` });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/seller/shop", { headers: authHeader() });
        const json = await res.json();
        if (json.success) {
          setCanRegister(json.data.canRegister);
          setShopName(json.data.shopName || "");
          setShopAddress(json.data.shopAddress || "");
          setShopLogo(json.data.shopLogo || "");
          setShopBanner(json.data.shopBanner || "");
          setShopDescription(json.data.shopDescription || "");
          setShopSlug(json.data.shopSlug || null);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/seller/shop", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ shopName, shopAddress, shopLogo, shopBanner, shopDescription }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        setShopSlug(json.data.shopSlug);
      } else {
        toast.error(json.message || "Failed to register shop");
      }
    } catch (err: any) {
      toast.error(err.message || "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <>
    <AppBar title="Shop profile" backHref="/dashboard" />
    <div className="max-w-xl w-full mx-auto px-4 py-5 pb-10">
      <div className="bg-card border border-card-border rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-content">Verified Shop</h1>
            <p className="text-sm text-content-secondary">Register your shop and earn the Verified Shop badge.</p>
          </div>
        </div>

        {shopSlug && (
          <Link
            href={`/shop/${shopSlug}`}
            className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700"
          >
            <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Your shop page is live</span>
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}

        {!canRegister && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            To become a Verified Shop, first complete{" "}
            <Link href="/dashboard/verify" className="font-semibold underline">ID verification</Link>.
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-content uppercase tracking-wider">Shop Name</label>
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder={`e.g. Multan ${VERTICAL.noun.One} Centre`}
              className="bg-surface-secondary border border-card-border text-sm rounded-xl px-4 py-3 outline-none text-content focus:border-primary transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-content uppercase tracking-wider">Shop Address</label>
            <input
              type="text"
              value={shopAddress}
              onChange={(e) => setShopAddress(e.target.value)}
              placeholder="e.g. Hussain Agahi Road, Multan"
              className="bg-surface-secondary border border-card-border text-sm rounded-xl px-4 py-3 outline-none text-content focus:border-primary transition-colors"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-content uppercase tracking-wider">About the shop</label>
            <textarea
              rows={3}
              maxLength={1000}
              value={shopDescription}
              onChange={(e) => setShopDescription(e.target.value)}
              placeholder="What you sell, warranty you give, timings…"
              className="bg-surface-secondary border border-card-border text-sm rounded-xl px-4 py-3 outline-none text-content focus:border-primary transition-colors resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-4">
            <ImageField label="Shop logo" value={shopLogo} onChange={setShopLogo} folder="shop" aspect="square" allowUrl={false} />
            <ImageField label="Cover banner" value={shopBanner} onChange={setShopBanner} folder="shop" aspect="banner" allowUrl={false} hint="Wide photo of your shop, about 1500 × 500." />
          </div>
          <button
            type="submit"
            disabled={saving || !canRegister}
            className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold py-3 px-8 rounded-xl text-sm transition-colors shadow flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {shopSlug ? "Update Shop" : "Register Shop"}
          </button>
        </form>
      </div>
    </div>
    </>
  );
}

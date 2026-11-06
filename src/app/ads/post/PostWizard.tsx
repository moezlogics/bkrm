"use client";

import { SectionThumb } from "@/components/home/SectionThumb";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { askForPush } from "@/lib/push-client";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ChevronRight, Check, Plus, X, Loader2, Camera, ImagePlus, AlertTriangle, ArrowLeft, ArrowRight,
  Images, LocateFixed, Star, Search, Video, Flame, Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { containsContactInfo } from "@/lib/spam";
import { AppBar } from "@/components/layout/AppChrome";
import { MediaPicker } from "@/components/media/MediaPicker";
import { uploadImages } from "@/lib/upload-client";
import { categoryIcon } from "@/lib/category-icons";
import { withBasePath } from "@/lib/base-path";
import { VERTICAL } from "@/vertical";
import { priceInWords } from "@/lib/utils";

const CONDITION_LABEL: Record<string, string> = { new: "New", used: "Used", refurbished: "Refurbished", "for-parts": "For Parts" };
const DRAFT_KEY = "sell-draft-v2";

type Cat = { _id: string; name: string; slug: string; path: string; parentCategoryId?: string | null; icon?: string; conditionSet?: string[]; showCondition?: boolean };
type Field = { _id: string; name: string; slug: string; type: string; required: boolean; values: string[]; unit?: string; placeholder?: string; helpText?: string; group?: string; categoryIds: string[]; sequence: number; allowCustom?: boolean; min?: number | null; max?: number | null };
type Loc = { name: string; slug: string; citySlug?: string };
type Photo = { url: string } | { pending: string; progress: number };

export type EditInit = {
  id: string; slug: string; categoryLabel: string; topId: string;
  title: string; description: string; price: string; negotiable: boolean; condition: string;
  customFields: Record<string, any>; images: string[]; city: string; area: string; phone: string; whatsapp: string;
  videoLink?: string; isUrgent?: boolean;
};

export function PostWizard({
  tops, allCats, fields, cities, areas, defaultCity = "", defaultArea = "", maxPhotos = 12, edit, covers = {},
}: {
  tops: Cat[]; allCats: Cat[]; fields: Field[]; cities: Loc[]; areas: Loc[];
  defaultCity?: string; defaultArea?: string; maxPhotos?: number; edit?: EditInit; covers?: Record<string, string>;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();

  const [phase, setPhase] = useState<"category" | "form">(edit ? "form" : "category");
  const [top, setTop] = useState<Cat | null>(edit ? tops.find((t) => t._id === edit.topId) || null : null);
  const [brand, setBrand] = useState("");
  const [brandCat, setBrandCat] = useState<Cat | null>(null);
  const [model, setModel] = useState("");
  const [sub, setSub] = useState<Cat | null>(null);
  const [newBrand, setNewBrand] = useState("");
  const [newModel, setNewModel] = useState("");
  const [catQuery, setCatQuery] = useState("");

  const [photos, setPhotos] = useState<Photo[]>((edit?.images || []).map((url) => ({ url })));
  const [videoLink, setVideoLink] = useState(edit?.videoLink || "");
  const [videoUploading, setVideoUploading] = useState(false);
  const [isUrgent, setIsUrgent] = useState(edit ? !!edit.isUrgent : false);
  const [condition, setCondition] = useState(edit?.condition || "");
  const [cf, setCf] = useState<Record<string, any>>(edit?.customFields || {});
  const [extra, setExtra] = useState<Record<string, string[]>>({}); // options typed under "Other"
  const [title, setTitle] = useState(edit?.title || "");
  // Until the seller types their own, the title follows make, model and year.
  const [titleTouched, setTitleTouched] = useState(!!edit?.title);
  const [description, setDescription] = useState(edit?.description || "");
  const [price, setPrice] = useState(edit?.price || "");
  const [negotiable, setNegotiable] = useState(edit ? edit.negotiable : true);
  const [city, setCity] = useState(edit?.city || defaultCity);
  const [area, setArea] = useState(edit?.area || defaultArea);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [phone, setPhone] = useState(edit?.phone || "");
  const [wa, setWa] = useState(edit?.whatsapp || "");
  const [sameWa, setSameWa] = useState(!edit || !edit.whatsapp || edit.whatsapp === edit.phone);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [library, setLibrary] = useState(false);
  const [draft, setDraft] = useState<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);

  const childrenOf = (id?: string | null) => allCats.filter((c) => String(c.parentCategoryId) === String(id));
  const isBrandTree = (t: Cat) => childrenOf(t._id).some((c) => childrenOf(c._id).length > 0);
  const topFields = useMemo(() => (top ? fields.filter((f) => f.categoryIds.map(String).includes(String(top._id))).sort((a, b) => a.sequence - b.sequence) : []), [top, fields]);
  const contactFlag = useMemo(() => containsContactInfo(`${title} ${description}`), [title, description]);
  const readyPhotos = photos.filter((p): p is { url: string } => "url" in p).map((p) => p.url);
  const uploading = photos.some((p) => "pending" in p);

  // ── Prefill contact number (and city) from the profile ──
  useEffect(() => {
    if (!session || edit) return;
    fetch("/api/auth/profile").then((r) => r.json()).then((j) => {
      if (!j?.success) return;
      if (j.data.phoneNumber) setPhone((p) => p || j.data.phoneNumber);
      if (j.data.city) setCity((c) => c || j.data.city);
    }).catch(() => {});
  }, [session, edit]);

  // ── Draft: offer to restore, then autosave ──
  useEffect(() => {
    if (edit) return;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (d && Date.now() - d.at < 7 * 864e5 && (d.title || d.photos?.length || d.topId)) setDraft(d);
    } catch { /* storage unavailable */ }
  }, [edit]);
  useEffect(() => {
    if (edit || phase !== "form" || !top) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          at: Date.now(), topId: top._id, brand, model, subId: sub?._id, photos: readyPhotos, videoLink, isUrgent, condition, cf, extra,
          title, titleTouched, description, price, negotiable, city, area, phone, wa, sameWa,
        }));
      } catch { /* quota */ }
    }, 600);
    return () => clearTimeout(t);
  }, [edit, phase, top, brand, model, sub, readyPhotos.join("|"), videoLink, isUrgent, condition, cf, extra, title, titleTouched, description, price, negotiable, city, area, phone, wa, sameWa]); // eslint-disable-line react-hooks/exhaustive-deps

  const restoreDraft = () => {
    const d = draft;
    const t = tops.find((x) => x._id === d.topId);
    if (t) setTop(t);
    setBrand(d.brand || ""); setModel(d.model || "");
    setSub(allCats.find((c) => c._id === d.subId) || null);
    setPhotos((d.photos || []).map((url: string) => ({ url })));
    setVideoLink(d.videoLink || "");
    setIsUrgent(!!d.isUrgent);
    setCondition(d.condition || ""); setCf(d.cf || {}); setExtra(d.extra || {});
    setTitle(d.title || ""); setTitleTouched(!!d.titleTouched); setDescription(d.description || ""); setPrice(d.price || "");
    setNegotiable(d.negotiable !== false); setCity(d.city || ""); setArea(d.area || "");
    setPhone(d.phone || ""); setWa(d.wa || ""); setSameWa(d.sameWa !== false);
    if (t) setPhase("form");
    setDraft(null);
  };
  const discardDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch {} setDraft(null); };

  // "Toyota Corolla" + model year 2021 → "Toyota Corolla 2021".
  const titleExtras = VERTICAL.titleFields.map((f) => cf[f]).filter((v) => v != null && v !== "" && !Array.isArray(v)).join(" ");
  useEffect(() => {
    if (titleTouched || phase !== "form") return;
    const base = [brand, model].filter(Boolean).join(" ").trim() || sub?.name || "";
    if (base) setTitle([base, titleExtras].filter(Boolean).join(" ").slice(0, 90));
  }, [titleTouched, phase, brand, model, sub, titleExtras]);

  // ── Auth gate ──
  if (status === "loading") return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!session) return (
    <>
      <AppBar title="Sell" backHref="/" />
      <div className="max-w-md mx-auto px-4 py-16 text-center flex flex-col items-center gap-4">
        <Camera className="h-12 w-12 text-primary" />
        <h2 className="text-xl font-bold text-content">Log in to start selling</h2>
        <p className="text-sm text-content-secondary">It takes a minute — then post your ad for free.</p>
        <Link href="/login?callbackUrl=/ads/post" className="rounded-lg bg-primary text-white font-semibold px-6 py-2.5">Log in / Sign up</Link>
      </div>
    </>
  );

  // ── Category selection ──
  const pickTop = (t: Cat) => {
    setTop(t); setBrand(""); setBrandCat(null); setModel(""); setSub(null); setCatQuery("");
    if (!isBrandTree(t) && childrenOf(t._id).length === 0) { setCondition((c) => c || t.conditionSet?.[0] || ""); setPhase("form"); }
  };
  const chooseBrand = (name: string, cat: Cat | null) => { setBrand(name); setBrandCat(cat); setModel(""); setCatQuery(""); };
  const finishCategory = (m: string) => {
    setModel(m);
    setCondition((c) => c || top?.conditionSet?.[0] || "");
    setTitle((t) => t || [brand, m].filter(Boolean).join(" ").trim());
    setPhase("form");
  };
  const chooseSub = (c: Cat) => { setSub(c); setCondition((x) => x || top?.conditionSet?.[0] || c.conditionSet?.[0] || ""); setTitle((t) => t || c.name); setPhase("form"); };

  // ── Photos ──
  const addFiles = async (files: FileList | File[] | null) => {
    const list = Array.from(files || []).slice(0, Math.max(0, maxPhotos - photos.length));
    if (!list.length) { if (files?.length) toast.error(`You can add up to ${maxPhotos} photos`); return; }
    const key = `u${Date.now()}`;
    setPhotos((p) => [...p, ...list.map((_, i) => ({ pending: `${key}-${i}`, progress: 0 }))]);
    setErrors((e) => ({ ...e, photos: "" }));
    // one request per photo: a failure only costs that photo, and progress is per tile
    await Promise.all(list.map(async (file, i) => {
      const id = `${key}-${i}`;
      try {
        const { items } = await uploadImages([file], {
          folder: "listings",
          // What's in the photo — used for its alt text (by the CDN's AI, or as a fallback)
          context: edit ? edit.categoryLabel.split(" › ").slice(1).join(" ") || edit.title : [brand, model, sub?.name].filter(Boolean).join(" ") || top?.name,
          onProgress: (pr) => setPhotos((p) => p.map((x) => ("pending" in x && x.pending === id ? { ...x, progress: pr } : x))),
        });
        setPhotos((p) => p.map((x) => ("pending" in x && x.pending === id ? { url: items[0].url } : x)));
      } catch (e: any) {
        setPhotos((p) => p.filter((x) => !("pending" in x && x.pending === id)));
        toast.error(e.message || "A photo failed to upload");
      }
    }));
    if (fileRef.current) fileRef.current.value = "";
  };
  const move = (i: number, d: number) => setPhotos((p) => {
    const j = i + d;
    if (j < 0 || j >= p.length) return p;
    const n = p.slice(); [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const makeCover = (i: number) => setPhotos((p) => [p[i], ...p.filter((_, x) => x !== i)]);

  // ── Video upload ──
  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) {
      toast.error("Video must be 30MB or less (around 15-30 seconds)");
      return;
    }
    setVideoUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload?folder=listings", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "Failed to upload video");
      }
      setVideoLink(data.data.url);
      toast.success("Video uploaded");
    } catch (err: any) {
      toast.error(err.message || "Failed to upload video");
    } finally {
      setVideoUploading(false);
      if (videoFileRef.current) videoFileRef.current.value = "";
    }
  };
  const removeVideo = () => {
    setVideoLink("");
  };

  // ── Specs ──
  const setField = (slug: string, val: any) => { setCf((p) => ({ ...p, [slug]: val })); setErrors((e) => ({ ...e, [`cf:${slug}`]: "" })); };
  const toggleMulti = (slug: string, val: string) => setCf((p) => {
    const arr: string[] = Array.isArray(p[slug]) ? p[slug] : [];
    return { ...p, [slug]: arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val] };
  });
  const addOther = (f: Field, raw: string) => {
    const v = raw.replace(/\s+/g, " ").trim();
    if (!v) return;
    if (v.length > 40) return toast.error("Keep it under 40 characters");
    const existing = [...f.values, ...(extra[f.slug] || [])].find((x) => x.toLowerCase() === v.toLowerCase());
    const val = existing || v;
    if (!existing) setExtra((p) => ({ ...p, [f.slug]: [...(p[f.slug] || []), v] }));
    if (f.type === "multiselect" || f.type === "checkbox") setCf((p) => ({ ...p, [f.slug]: Array.from(new Set([...(Array.isArray(p[f.slug]) ? p[f.slug] : []), val])) }));
    else setField(f.slug, val);
  };

  // ── Location: GPS ──
  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Location isn't available on this device");
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setCoords(c);
      try {
        const j = await (await fetch(`/api/cities/detect?lat=${c.lat}&lng=${c.lng}`)).json();
        if (j?.success && !j.data.fallback) {
          setCity(j.data.name);
          setArea(j.data.area?.name || "");
          setErrors((e) => ({ ...e, location: "" }));
          toast.success(`Location set to ${[j.data.area?.name, j.data.name].filter(Boolean).join(", ")}`);
        }
      } catch { toast.error("Couldn't detect your area — please choose it"); }
    }, () => toast.error("Please allow location access, or choose your city below"), { enableHighAccuracy: true, timeout: 10000 });
  };

  // ── Validate + submit ──
  const validate = () => {
    const e: Record<string, string> = {};
    if (!readyPhotos.length) e.photos = "Add at least one photo — ads with photos sell much faster";
    if (top?.showCondition !== false && (top?.conditionSet?.length ?? 0) > 0 && !condition) e.condition = "Choose the condition";
    for (const f of topFields) {
      const v = cf[f.slug];
      if (f.required && (v == null || v === "" || (Array.isArray(v) && !v.length))) e[`cf:${f.slug}`] = `${f.name} is required`;
    }
    if (title.trim().length < 5) e.title = "Write a title of at least 5 characters";
    if (contactFlag.phone || contactFlag.url || contactFlag.email) e.description = "Remove phone numbers, emails and links from the title/description";
    if (!price) e.price = "Enter a price";
    if (!city.trim()) e.location = "Choose your city";
    if (phone.replace(/\D/g, "").length < 10) e.phone = "Enter a valid contact number";
    return e;
  };
  const focusError = (key: string) => {
    requestAnimationFrame(() => document.querySelector(`[data-field="${key.startsWith("cf:") ? key : key}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const submit = async () => {
    if (uploading || videoUploading) return toast.info("Please wait — uploads are still in progress");
    const e = validate();
    setErrors(e);
    const first = Object.keys(e).find((k) => e[k]);
    if (first) { toast.error(e[first]); focusError(first); return; }
    setSubmitting(true);
    try {
      const body = {
        topCategoryId: top?._id, brand: brand || undefined, model: model || undefined, subCategoryId: sub?._id,
        title, description, condition, customFields: cf, images: readyPhotos, price, negotiable,
        city, area, coords, contactNumber: phone, whatsappNumber: sameWa ? phone : wa,
        videoLink: videoLink || undefined, isUrgent,
      };
      const r = await fetch(edit ? `/api/ads/publish?id=${edit.id}` : "/api/ads/publish", {
        method: edit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j?.success) {
        if (!edit) discardDraft();
        if (j.held) toast.info(j.message); else toast.success(j.message || "Done");
        if (!edit) askForPush("post");
        // Full navigation: pages prefetched earlier in this tab predate the change.
        window.location.assign(withBasePath(`/ads/${j.data.slug}${edit ? "" : "?posted=1"}`));
        return;
      }
      if (j?.field) { setErrors((x) => ({ ...x, [j.field]: j.message })); focusError(j.field); }
      toast.error(j?.message || "Couldn't save the ad");
      if (j?.code === "limit") setTimeout(() => router.push("/dashboard/plans?reason=limit"), 1400);
    } catch (err: any) {
      toast.error(err.message || "Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Back button behaviour (one level up, like an app) ──
  const onBack = () => {
    if (phase === "form" && !edit) return setPhase("category");
    if (phase === "category" && brand) { setBrand(""); setBrandCat(null); return; }
    if (phase === "category" && top) { setTop(null); return; }
    if (edit) return router.push("/dashboard/seller");
    router.push("/");
  };

  const catLabel = edit ? edit.categoryLabel : [top?.name, brand, model, sub?.name].filter(Boolean).join(" › ");

  // ───────────────────────── CATEGORY PHASE ─────────────────────────
  if (phase === "category") {
    const q = catQuery.trim().toLowerCase();
    return (
      <>
        <AppBar title={VERTICAL.copy.sellCta} subtitle="Step 1 of 2 · Category" onBack={onBack} />
        <div className="max-w-2xl w-full mx-auto px-4 py-4 pb-10">
          {draft && (
            <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-content">Continue your unfinished ad?</p>
                <p className="text-[12px] text-content-secondary truncate">{draft.title || "Draft saved on this device"}</p>
              </div>
              <button onClick={discardDraft} className="text-xs font-semibold text-content-tertiary px-2">Discard</button>
              <button onClick={restoreDraft} className="h-9 px-4 rounded-lg bg-primary text-white text-xs font-semibold">Continue</button>
            </div>
          )}

          {top && (
            <div className="flex items-center gap-1.5 text-sm text-content-secondary mb-3 flex-wrap">
              <button onClick={() => { setTop(null); setBrand(""); setBrandCat(null); }} className="hover:text-primary">All categories</button>
              <ChevronRight className="h-3.5 w-3.5" />
              <button onClick={() => { setBrand(""); setBrandCat(null); }} className={brand ? "hover:text-primary" : "text-content font-semibold"}>{top.name}</button>
              {brand && <><ChevronRight className="h-3.5 w-3.5" /><span className="text-content font-semibold">{brand}</span></>}
            </div>
          )}

          {!top && (
            <>
              <h2 className="text-[22px] font-extrabold tracking-tight text-content mb-1">What are you selling?</h2>
              <p className="text-[14.5px] text-content-secondary mb-5">Pick one — posting takes about a minute.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {tops.map((t) => (
                  <button key={t._id} onClick={() => pickTop(t)} className="card !rounded-2xl overflow-hidden text-left active:scale-[0.98] transition-transform">
                    <SectionThumb src={covers[t.slug]} icon={t.icon} sizes="(max-width: 640px) 50vw, 200px" className="w-full aspect-[4/3]" />
                    <span className="block px-3.5 py-3 text-[14.5px] font-bold text-content">{t.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {top && isBrandTree(top) && (
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-content-tertiary" />
              <input value={catQuery} onChange={(e) => setCatQuery(e.target.value)} placeholder={brand ? `Search ${brand} models` : `Search ${VERTICAL.brandWord.many}`} className="w-full h-11 pl-9 pr-3 rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] text-sm outline-none focus:border-primary" />
            </div>
          )}

          {top && isBrandTree(top) && !brand && (
            <BrandModelPicker
              title={`Choose the ${VERTICAL.brandWord.one}`}
              options={childrenOf(top._id).filter((c) => !q || c.name.toLowerCase().includes(q))}
              onPick={(c) => chooseBrand(c.name, c)}
              newValue={newBrand} setNewValue={setNewBrand}
              onNew={(v) => chooseBrand(v, null)}
              placeholder={`${VERTICAL.brandWord.one.replace(/^./, (m) => m.toUpperCase())} not listed? Type it`}
            />
          )}
          {top && isBrandTree(top) && brand && (
            <BrandModelPicker
              title="Choose the model"
              options={(brandCat ? childrenOf(brandCat._id) : []).filter((c) => !q || c.name.toLowerCase().includes(q))}
              stripPrefix={brand}
              onPick={(c) => finishCategory(c.name.replace(new RegExp(`^${brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), ""))}
              newValue={newModel} setNewValue={setNewModel}
              onNew={(v) => finishCategory(v)}
              onSkip={() => finishCategory("")}
              placeholder={VERTICAL.copy.modelNotListed}
            />
          )}
          {top && !isBrandTree(top) && childrenOf(top._id).length > 0 && VERTICAL.copy.subPicker && (
            <p className="text-sm font-bold text-content mb-2.5">{VERTICAL.subLabels?.[top.slug] ? `Which ${VERTICAL.subLabels[top.slug]}?` : VERTICAL.copy.subPicker}</p>
          )}
          {top && !isBrandTree(top) && childrenOf(top._id).length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {childrenOf(top._id).map((c) => (
                <button key={c._id} onClick={() => chooseSub(c)} className="rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] p-4 text-sm font-semibold text-content hover:border-primary hover:shadow-sm text-left transition-all">{c.name}</button>
              ))}
            </div>
          )}
        </div>
      </>
    );
  }

  // ───────────────────────── FORM PHASE ─────────────────────────
  const Err = ({ k }: { k: string }) => (errors[k] ? <p className="text-xs font-medium text-red-600 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{errors[k]}</p> : null);
  const words = VERTICAL.priceStyle === "lakh" ? priceInWords(Number(price)) : "";
  const pricePreview = Number(price) > 0 ? `Rs ${Number(price).toLocaleString("en-PK")}${words ? ` (${words})` : ""}` : "";

  return (
    <>
      <AppBar title={edit ? "Edit ad" : VERTICAL.copy.sellCta} subtitle={edit ? edit.title : "Step 2 of 2 · Details"} onBack={onBack} />
      <div className="max-w-2xl w-full mx-auto px-4 py-4 pb-32">
        <button onClick={() => !edit && setPhase("category")} disabled={!!edit} className="flex items-center gap-2 text-sm mb-5 rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] px-3 py-2.5 w-full text-left">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-content-tertiary shrink-0">Category</span>
          <span className="font-semibold text-content truncate">{catLabel}</span>
          {!edit && <span className="ml-auto text-xs text-primary font-semibold shrink-0">Change</span>}
        </button>

        <div className="flex flex-col gap-6">
          {/* Photos */}
          <Section k="photos" title="Photos" required hint={`Add up to ${maxPhotos}. The first photo is the cover — tap a photo's star to make it the cover.`}>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {photos.map((p, i) => (
                <div key={"url" in p ? p.url + i : p.pending} className="relative aspect-square rounded-xl overflow-hidden border border-card-border bg-surface-secondary">
                  {"url" in p ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))} className="absolute top-1 right-1 grid place-items-center h-6 w-6 rounded-full bg-black/60 text-white" aria-label="Remove photo"><X className="h-3.5 w-3.5" /></button>
                      {i === 0 ? (
                        <span className="absolute bottom-0 inset-x-0 bg-primary text-white text-[11px] font-semibold text-center py-0.5">Cover</span>
                      ) : (
                        <div className="absolute bottom-1 inset-x-1 flex items-center justify-between">
                          <button type="button" onClick={() => move(i, -1)} className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white" aria-label="Move left"><ArrowLeft className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => makeCover(i)} className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white" aria-label="Make cover" title="Make cover"><Star className="h-3.5 w-3.5" /></button>
                          <button type="button" onClick={() => move(i, 1)} disabled={i === photos.length - 1} className="grid place-items-center h-6 w-6 rounded-full bg-black/55 text-white disabled:opacity-30" aria-label="Move right"><ArrowRight className="h-3.5 w-3.5" /></button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="flex flex-col items-center gap-1.5 w-2/3">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        <div className="h-1 w-full rounded-full bg-surface-tertiary overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.max(6, p.progress * 100)}%` }} /></div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {photos.length < maxPhotos && (
                <button type="button" onClick={() => fileRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-card-border grid place-items-center text-content-tertiary hover:border-primary hover:text-primary transition-colors bg-card">
                  <span className="flex flex-col items-center gap-1"><ImagePlus className="h-6 w-6" /><span className="text-[12px] font-semibold">Add photos</span></span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setLibrary(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"><Images className="h-4 w-4" /> Choose from my uploads</button>
              <span className="text-[12px] text-content-tertiary">{readyPhotos.length}/{maxPhotos}</span>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" multiple hidden onChange={(e) => addFiles(e.target.files)} />
            <MediaPicker open={library} onClose={() => setLibrary(false)} multiple max={Math.max(1, maxPhotos - photos.length)} folder="listings" title="Your photos"
              onSelect={(items) => setPhotos((p) => [...p, ...items.map((m) => ({ url: m.url }))].slice(0, maxPhotos))} />
          </Section>

          {/* Short Video (Optional) */}
          <Section k="video" title="Short video" hint={VERTICAL.copy.videoHint}>
            {videoLink ? (
              <div className="relative rounded-2xl overflow-hidden border border-card-border bg-black max-w-sm">
                <video src={videoLink} controls playsInline className="w-full aspect-[9/16] max-h-72 object-cover" />
                <button
                  type="button"
                  onClick={removeVideo}
                  className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/90 hover:bg-red-700 text-white text-xs font-semibold shadow-md backdrop-blur transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove Video
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  ref={videoFileRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={handleVideoUpload}
                />
                <button
                  type="button"
                  disabled={videoUploading}
                  onClick={() => videoFileRef.current?.click()}
                  className="flex items-center justify-center gap-2.5 h-13 rounded-xl border-2 border-dashed border-card-border bg-card hover:border-primary hover:text-primary text-content-secondary transition-all disabled:opacity-50 py-3"
                >
                  {videoUploading ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span className="text-xs font-semibold">Uploading video...</span>
                    </>
                  ) : (
                    <>
                      <Video className="h-5 w-5 text-primary" />
                      <span className="text-xs font-semibold">Upload a short video (MP4 / WebM, max 30 MB)</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </Section>

          {/* Condition */}
          {top?.showCondition !== false && (top?.conditionSet?.length ?? 0) > 0 && (
            <Section k="condition" title="Condition" required>
              <Chips options={(top?.conditionSet || []).map((c) => ({ value: c, label: CONDITION_LABEL[c] || c }))} value={condition} onChange={(v) => { setCondition(v); setErrors((e) => ({ ...e, condition: "" })); }} />
            </Section>
          )}

          {/* Specs */}
          {topFields.map((f) => {
            const k = `cf:${f.slug}`;
            const custom = f.allowCustom !== false;
            // With "+ Other" available, a stored "Other" option is redundant (and two
            // "Other" buttons confuse people) — the typed value is better data anyway.
            const base = custom ? f.values.filter((v) => !/^others?$/i.test(v.trim())) : f.values;
            const opts = [...base, ...(extra[f.slug] || []).filter((x) => !base.some((v) => v.toLowerCase() === x.toLowerCase()))];
            return (
              <Section key={f._id} k={k} title={f.name + (f.unit ? ` (${f.unit})` : "")} required={f.required} hint={f.helpText}>
                {(f.type === "dropdown" || f.type === "radio") && (
                  <Chips options={opts.map((v) => ({ value: v, label: v }))} value={cf[f.slug] || ""} onChange={(v) => setField(f.slug, v)}
                    other={custom ? { label: `Other ${f.name.toLowerCase()}`, onAdd: (v) => addOther(f, v) } : undefined} />
                )}
                {(f.type === "multiselect" || f.type === "checkbox") && (
                  <MultiChips options={opts} value={Array.isArray(cf[f.slug]) ? cf[f.slug] : []} onToggle={(v) => toggleMulti(f.slug, v)}
                    other={custom ? { label: "Add another", onAdd: (v) => addOther(f, v) } : undefined} />
                )}
                {(f.type === "number" || f.type === "decimal" || f.type === "year") && (
                  <input type="number" inputMode="numeric" value={cf[f.slug] ?? ""} min={f.min ?? undefined} max={f.max ?? undefined} onChange={(e) => setField(f.slug, e.target.value)} placeholder={f.placeholder || ""} className={inputCls(!!errors[k])} />
                )}
                {(f.type === "text" || f.type === "textarea") && (
                  <input value={cf[f.slug] ?? ""} onChange={(e) => setField(f.slug, e.target.value)} placeholder={f.placeholder || ""} className={inputCls(!!errors[k])} />
                )}
                {f.type === "boolean" && (
                  <Chips options={[{ value: "Yes", label: "Yes" }, { value: "No", label: "No" }]} value={cf[f.slug] || ""} onChange={(v) => setField(f.slug, v)} />
                )}
                <Err k={k} />
              </Section>
            );
          })}

          {/* Title + description */}
          <Section k="title" title="Ad title" required hint={VERTICAL.copy.titleHint}>
            <input value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); setErrors((x) => ({ ...x, title: "" })); }} maxLength={90} placeholder={VERTICAL.copy.titlePlaceholder} className={inputCls(!!errors.title)} />
            <div className="flex justify-between"><Err k="title" /><span className="text-[12px] text-content-tertiary ml-auto">{title.length}/90</span></div>
          </Section>
          <Section k="description" title="Description" hint={VERTICAL.copy.descriptionPlaceholder}>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={4000} placeholder="Describe it honestly — buyers trust detailed ads." className={`${inputCls(!!errors.description)} h-auto py-3 resize-none`} />
            {(contactFlag.phone || contactFlag.url || contactFlag.email) && (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {contactFlag.phone ? "Please don't put a phone number here — add it in Contact number below. It's only shown to logged-in buyers." : contactFlag.url ? "Links aren't allowed in the title or description." : "Email addresses aren't allowed in the title or description."}
              </p>
            )}
            <div className="flex justify-between"><Err k="description" /><span className="text-[12px] text-content-tertiary ml-auto">{description.length}/4000</span></div>
          </Section>

          {/* Price */}
          <Section k="price" title="Price (Rs)" required>
            <div className="flex items-center gap-3">
              <input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => { setPrice(e.target.value); setErrors((x) => ({ ...x, price: "" })); }} placeholder={`e.g. ${top?.slug === VERTICAL.primaryTop ? VERTICAL.budgets[2] ?? 100000 : 5000}`} className={`${inputCls(!!errors.price)} flex-1`} />
              <label className="flex items-center gap-1.5 text-sm text-content-secondary shrink-0 cursor-pointer">
                <input type="checkbox" checked={negotiable} onChange={(e) => setNegotiable(e.target.checked)} className="accent-primary h-4 w-4 rounded" /> Negotiable
              </label>
            </div>
            {pricePreview && <p className="text-xs text-content-secondary">Buyers will see <b className="text-content">{pricePreview}</b>{negotiable ? " · Negotiable" : ""}</p>}
            
            <div className="mt-2.5 pt-2.5 border-t border-card-border/60">
              <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-content">
                <input
                  type="checkbox"
                  checked={isUrgent}
                  onChange={(e) => setIsUrgent(e.target.checked)}
                  className="accent-red-600 h-4 w-4 rounded"
                />
                <span className="flex items-center gap-1 text-red-600 font-bold">
                  <Flame className="h-4 w-4" /> Mark as Urgent Sale
                </span>
                <span className="text-xs text-content-tertiary font-normal">(Shows an Urgent tag on the card and the ad page)</span>
              </label>
            </div>
            <Err k="price" />
          </Section>

          {/* Location */}
          <Section k="location" title="Location" required>
            <LocationFields cities={cities} areas={areas} city={city} area={area}
              onCity={(v) => { setCity(v); setArea(""); setCoords(null); setErrors((x) => ({ ...x, location: "" })); }}
              onArea={setArea} onGps={useMyLocation} />
            <Err k="location" />
          </Section>

          {/* Contact */}
          <Section k="phone" title="Contact number" required hint="Shown only to logged-in buyers, for calls and WhatsApp.">
            <input type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); setErrors((x) => ({ ...x, phone: "" })); }} placeholder="03XX XXXXXXX" className={inputCls(!!errors.phone)} />
            <label className="flex items-center gap-1.5 text-sm text-content-secondary">
              <input type="checkbox" checked={sameWa} onChange={(e) => setSameWa(e.target.checked)} className="accent-primary h-4 w-4" /> Same number on WhatsApp
            </label>
            {!sameWa && <input type="tel" inputMode="tel" value={wa} onChange={(e) => setWa(e.target.value)} placeholder="WhatsApp number" className={inputCls(false)} />}
            <Err k="phone" />
          </Section>
        </div>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-card-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-2xl mx-auto">
          <button onClick={submit} disabled={submitting} className="w-full h-12 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold text-base flex items-center justify-center gap-2 shadow-lg shadow-primary/25 active:scale-[0.98] transition-all disabled:opacity-60">
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Check className="h-5 w-5" /> {edit ? "Save changes" : "Post ad"}</>}
          </button>
          {uploading && <p className="text-[12px] text-center text-content-tertiary mt-1">Photos are uploading…</p>}
        </div>
      </div>
    </>
  );
}

const inputCls = (err: boolean) =>
  `w-full h-11 rounded-xl border ${err ? "border-red-400" : "border-card-border"} px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-card`;

function Section({ k, title, hint, required, children }: { k: string; title: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div data-field={k} className="flex flex-col gap-2 scroll-mt-20">
      <div>
        <label className="text-sm font-semibold text-content">{title}{required && <span className="text-primary"> *</span>}</label>
        {hint && <p className="text-[12px] text-content-tertiary mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function OtherInput({ label, onAdd }: { label: string; onAdd: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState("");
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="px-3.5 py-2 rounded-xl text-sm font-semibold border-2 border-dashed border-card-border text-content-secondary hover:border-primary hover:text-primary inline-flex items-center gap-1">
        <Plus className="h-4 w-4" /> Other
      </button>
    );
  }
  const add = () => { if (v.trim()) { onAdd(v); setV(""); setOpen(false); } };
  return (
    <span className="inline-flex items-center gap-1.5">
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } if (e.key === "Escape") setOpen(false); }}
        placeholder={label} maxLength={40} className="h-10 w-44 rounded-xl border border-primary px-3 text-sm outline-none bg-card" />
      <button type="button" onClick={add} className="h-10 px-3 rounded-xl bg-primary text-white text-sm font-semibold">Add</button>
      <button type="button" onClick={() => setOpen(false)} className="h-10 w-9 grid place-items-center rounded-xl text-content-tertiary" aria-label="Cancel"><X className="h-4 w-4" /></button>
    </span>
  );
}

function Chips({ options, value, onChange, other }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; other?: { label: string; onAdd: (v: string) => void } }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button type="button" key={o.value} onClick={() => onChange(o.value)} className={`px-3.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95 ${value === o.value ? "bg-primary text-white border-primary" : "border-card-border bg-card text-content-secondary hover:border-primary/40"}`}>
          {o.label}
        </button>
      ))}
      {other && <OtherInput label={other.label} onAdd={other.onAdd} />}
    </div>
  );
}

function MultiChips({ options, value, onToggle, other }: { options: string[]; value: string[]; onToggle: (v: string) => void; other?: { label: string; onAdd: (v: string) => void } }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((v) => {
        const on = value.includes(v);
        return (
          <button type="button" key={v} onClick={() => onToggle(v)} className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors inline-flex items-center gap-1 ${on ? "bg-primary text-white border-primary" : "border-card-border bg-card text-content-secondary hover:border-primary"}`}>
            {on && <Check className="h-3.5 w-3.5" />}{v}
          </button>
        );
      })}
      {other && <OtherInput label={other.label} onAdd={other.onAdd} />}
    </div>
  );
}

/** City + area pickers with "not listed? add it" and GPS detect. */
function LocationFields({ cities, areas, city, area, onCity, onArea, onGps }: {
  cities: Loc[]; areas: Loc[]; city: string; area: string; onCity: (v: string) => void; onArea: (v: string) => void; onGps: () => void;
}) {
  const known = cities.find((c) => c.name.toLowerCase() === city.trim().toLowerCase());
  const [newCity, setNewCity] = useState(!!city && !known);
  const areaOpts = known ? areas.filter((a) => a.citySlug === known.slug) : [];
  const areaKnown = areaOpts.some((a) => a.name.toLowerCase() === area.trim().toLowerCase());
  const [newArea, setNewArea] = useState(!!area && !areaKnown);
  const sel = "h-11 w-full rounded-xl border border-card-border px-3 text-sm outline-none focus:border-primary bg-card";

  return (
    <div className="flex flex-col gap-2.5">
      <button type="button" onClick={onGps} className="self-start inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-card shadow-sm ring-1 ring-black/[0.03] text-xs font-semibold text-primary hover:border-primary">
        <LocateFixed className="h-4 w-4" /> Use my current location
      </button>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {newCity ? (
          <div className="flex flex-col gap-1">
            <input value={city} onChange={(e) => onCity(e.target.value)} placeholder="Type your city" maxLength={40} className={sel} autoFocus />
            <button type="button" onClick={() => { setNewCity(false); onCity(""); }} className="self-start text-[12px] font-semibold text-content-tertiary hover:text-primary">Choose from the list instead</button>
          </div>
        ) : (
          <select value={known?.name || ""} onChange={(e) => { if (e.target.value === "__new") { setNewCity(true); onCity(""); setNewArea(true); } else { onCity(e.target.value); setNewArea(false); } }} className={sel}>
            <option value="">Choose city</option>
            {cities.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
            <option value="__new">My city isn't listed — add it</option>
          </select>
        )}

        {newCity || newArea || (known && !areaOpts.length) ? (
          <div className="flex flex-col gap-1">
            <input value={area} onChange={(e) => onArea(e.target.value)} placeholder="Area / neighbourhood (optional)" maxLength={40} className={sel} />
            {!newCity && areaOpts.length > 0 && <button type="button" onClick={() => { setNewArea(false); onArea(""); }} className="self-start text-[12px] font-semibold text-content-tertiary hover:text-primary">Choose from the list instead</button>}
          </div>
        ) : (
          <select value={areaKnown ? areaOpts.find((a) => a.name.toLowerCase() === area.toLowerCase())?.name : ""} onChange={(e) => { if (e.target.value === "__new") { setNewArea(true); onArea(""); } else onArea(e.target.value); }} disabled={!known} className={`${sel} disabled:opacity-50`}>
            <option value="">{known ? "Area (optional)" : "Choose a city first"}</option>
            {areaOpts.map((a) => <option key={a.slug} value={a.name}>{a.name}</option>)}
            {known && <option value="__new">My area isn't listed — add it</option>}
          </select>
        )}
      </div>
      {(newCity || newArea) && <p className="text-[12px] text-content-tertiary">New places are added to our list, so other people in your area can find your ad.</p>}
    </div>
  );
}

function BrandModelPicker({ title, options, onPick, newValue, setNewValue, onNew, onSkip, placeholder, stripPrefix }: {
  title: string; options: Cat[]; onPick: (c: Cat) => void; newValue: string; setNewValue: (v: string) => void; onNew: (v: string) => void; onSkip?: () => void; placeholder: string; stripPrefix?: string;
}) {
  const label = (c: Cat) => (stripPrefix ? c.name.replace(new RegExp(`^${stripPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i"), "") : c.name);
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-bold text-content">{title}</h2>
      {options.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {options.map((c) => (
            <button key={c._id} onClick={() => onPick(c)} className="flex items-center justify-between rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] px-3.5 py-3 text-sm font-semibold text-content hover:border-primary active:scale-[0.98] transition-all text-left">
              <span className="truncate">{label(c)}</span> <ChevronRight className="h-4 w-4 text-content-tertiary shrink-0" />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-xs text-content-tertiary">Nothing matches — type it below.</p>
      )}
      <div className="flex items-center gap-2 pt-1">
        <input value={newValue} onChange={(e) => setNewValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newValue.trim()) onNew(newValue.trim()); }} placeholder={placeholder} maxLength={40} className="flex-1 h-11 rounded-xl border border-card-border px-3.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 bg-card" />
        <button onClick={() => newValue.trim() && onNew(newValue.trim())} disabled={!newValue.trim()} className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-bold disabled:opacity-50 flex items-center gap-1.5 active:scale-95 transition-all"><Plus className="h-4 w-4" /> Add</button>
      </div>
      {onSkip && <button onClick={onSkip} className="text-sm font-semibold text-primary hover:underline self-start pt-1">Skip the model →</button>}
    </div>
  );
}

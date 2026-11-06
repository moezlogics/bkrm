"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Camera, Loader2, Eye, EyeOff, KeyRound, Images } from "lucide-react";
import { AppBar } from "@/components/layout/AppChrome";
import { useToast } from "@/components/ui/Toast";
import { uploadImages } from "@/lib/upload-client";
import { MediaPicker } from "@/components/media/MediaPicker";
import { VERTICAL } from "@/vertical";

type City = { name: string; slug: string };
type Area = { name: string; slug: string };

const field = "h-11 w-full rounded-xl border border-card-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const label = "text-xs font-semibold text-content-secondary";

export default function ProfilePage() {
  const { status, update } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  // "About you" is a seller thing (it's shown on the seller page), not asked of buyers.
  const [isSeller, setIsSeller] = useState(false);
  const [form, setForm] = useState({ name: "", phoneNumber: "", profileImage: "", city: "", area: "", bio: "" });
  const [initial, setInitial] = useState(form);
  const [cities, setCities] = useState<City[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [picker, setPicker] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login?callbackUrl=/dashboard/profile");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    Promise.all([fetch("/api/auth/profile").then((r) => r.json()), fetch("/api/cities").then((r) => r.json())])
      .then(([p, c]) => {
        if (p?.success) {
          const d = p.data;
          const f = { name: d.name || "", phoneNumber: d.phoneNumber || "", profileImage: d.profileImage || "", city: d.city || "", area: d.area || "", bio: d.bio || "" };
          setForm(f); setInitial(f); setEmail(d.email || ""); setIsSeller(!!d.isSeller);
          // Arrived from "Add mobile number" → straight to the field.
          if (!f.phoneNumber && new URLSearchParams(window.location.search).get("verify") === "phone") {
            setTimeout(() => document.getElementById("phone-input")?.focus(), 50);
          }
        }
        if (c?.success) setCities(c.data.map((x: any) => ({ name: x.name, slug: x.slug })));
      })
      .catch(() => toast.error("Couldn't load your profile"))
      .finally(() => setLoading(false));
  }, [status, toast]);

  const citySlug = cities.find((c) => c.name.toLowerCase() === form.city.toLowerCase())?.slug;
  useEffect(() => {
    if (!citySlug) { setAreas([]); return; }
    fetch(`/api/cities?citySlug=${citySlug}`).then((r) => r.json()).then((j) => j?.success && setAreas(j.data.map((a: any) => ({ name: a.name, slug: a.slug })))).catch(() => {});
  }, [citySlug]);

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const { items } = await uploadImages([file], { folder: "profile", context: "Profile photo" });
      if (items[0]) set("profileImage", items[0].url);
    } catch (e: any) { toast.error(e.message || "Upload failed"); }
    finally { setPhotoBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/auth/profile", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      const d = j.data;
      const f = { name: d.name || "", phoneNumber: d.phoneNumber || "", profileImage: d.profileImage || "", city: d.city || "", area: d.area || "", bio: d.bio || "" };
      setForm(f); setInitial(f);
      update?.({ name: d.name, image: d.profileImage }).catch(() => {});
      toast.success("Profile saved");
      router.refresh();
    } catch (e: any) {
      toast.error(e.message || "Couldn't save your profile");
    } finally { setSaving(false); }
  };

  return (
    <>
      <AppBar title="Edit profile" backHref="/dashboard" />
      {loading ? (
        <div className="grid place-items-center py-24"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : (
        <div className="max-w-xl w-full mx-auto px-4 py-5 pb-28 flex flex-col gap-6">
          {/* Photo */}
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => fileRef.current?.click()} className="relative h-20 w-20 rounded-full overflow-hidden bg-primary/10 text-primary grid place-items-center text-2xl font-semibold border border-card-border shrink-0" aria-label="Change profile photo">
              {form.profileImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.profileImage} alt="" className="h-full w-full object-cover" />
              ) : (form.name[0]?.toUpperCase() || "U")}
              <span className="absolute inset-x-0 bottom-0 h-7 bg-black/55 grid place-items-center">
                {photoBusy ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : <Camera className="h-4 w-4 text-white" />}
              </span>
            </button>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-content">Profile photo</span>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="h-8 px-3 rounded-lg border border-card-border bg-card text-xs font-semibold hover:border-primary">Upload</button>
                <button type="button" onClick={() => setPicker(true)} className="h-8 px-3 rounded-lg border border-card-border bg-card text-xs font-semibold hover:border-primary inline-flex items-center gap-1"><Images className="h-3.5 w-3.5" /> My uploads</button>
                {form.profileImage && <button type="button" onClick={() => set("profileImage", "")} className="h-8 px-2 text-xs font-semibold text-content-tertiary hover:text-red-600">Remove</button>}
              </div>
            </div>
            <input ref={fileRef} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => onPhoto(e.target.files?.[0])} />
            <MediaPicker open={picker} onClose={() => setPicker(false)} folder="profile" onSelect={(it) => it[0] && set("profileImage", it[0].url)} />
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className={label}>Full name</label>
              <input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={60} className={field} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className={label}>Email</label>
              <input value={email} readOnly className={`${field} bg-surface-secondary text-content-secondary`} />
            </div>
            <div id="phone" className="flex flex-col gap-1.5 scroll-mt-24">
              <label htmlFor="phone-input" className={label}>Mobile number</label>
              <input id="phone-input" type="tel" inputMode="tel" autoComplete="tel" value={form.phoneNumber} onChange={(e) => set("phoneNumber", e.target.value)} placeholder="03XX XXXXXXX"
                className={`${field} ${!initial.phoneNumber ? "border-amber-400" : ""}`} />
              <p className="text-[11px] text-content-tertiary">
                {initial.phoneNumber ? "Pre-filled as the contact number when you post an ad." : "Add your number to verify your account — it's also pre-filled when you post an ad. It isn't shown publicly."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1.5">
                <label className={label}>City</label>
                <select value={citySlug ? cities.find((c) => c.slug === citySlug)!.name : ""} onChange={(e) => { set("city", e.target.value); set("area", ""); }} className={field}>
                  <option value="">Choose city</option>
                  {cities.map((c) => <option key={c.slug} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className={label}>Area</label>
                {areas.length ? (
                  <select value={form.area} onChange={(e) => set("area", e.target.value)} className={field}>
                    <option value="">Choose area</option>
                    {areas.map((a) => <option key={a.slug} value={a.name}>{a.name}</option>)}
                  </select>
                ) : (
                  <input value={form.area} onChange={(e) => set("area", e.target.value)} placeholder="Optional" maxLength={60} className={field} />
                )}
              </div>
            </div>
            {isSeller && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="seller-bio" className={label}>About you as a seller <span className="font-normal text-content-tertiary">(shown on your seller page)</span></label>
                <textarea id="seller-bio" value={form.bio} onChange={(e) => set("bio", e.target.value)} rows={3} maxLength={300} placeholder={`e.g. Selling genuine ${VERTICAL.noun.many} since 2018 — meet in Gulberg.`} className={`${field} h-auto py-3 resize-none`} />
                <span className="text-[11px] text-content-tertiary self-end">{form.bio.length}/300</span>
              </div>
            )}
          </div>

          <PasswordSection />
        </div>
      )}

      <div className="fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-md border-t border-card-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="max-w-xl mx-auto">
          <button onClick={save} disabled={!dirty || saving || photoBusy} className="w-full h-12 rounded-xl bg-primary hover:bg-primary-dark text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : dirty ? "Save changes" : "No changes"}
          </button>
        </div>
      </div>
    </>
  );
}

function PasswordSection() {
  const { toast } = useToast();
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/password").then((r) => r.json()).then((j) => setHasPassword(!!j?.data?.hasPassword)).catch(() => setHasPassword(true));
  }, []);

  const submit = async () => {
    if (next.length < 8) return toast.error("New password must be at least 8 characters");
    if (next !== confirm) return toast.error("The new passwords don't match");
    setBusy(true);
    try {
      const r = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: cur, newPassword: next }) });
      const j = await r.json();
      if (!j.success) throw new Error(j.message);
      toast.success(hasPassword ? "Password changed" : "Password set — you can now also log in with email");
      setCur(""); setNext(""); setConfirm(""); setHasPassword(true);
    } catch (e: any) { toast.error(e.message || "Couldn't change the password"); }
    finally { setBusy(false); }
  };

  return (
    <section id="security" className="scroll-mt-20 rounded-2xl border border-card-border bg-card p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-content">{hasPassword === false ? "Set a password" : "Change password"}</h2>
      </div>
      {hasPassword === false && <p className="text-[11px] text-content-tertiary">You signed up with Google. Set a password to also log in with your email.</p>}
      {hasPassword && (
        <input type={show ? "text" : "password"} value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" className={field} />
      )}
      <div className="relative">
        <input type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className={`${field} pr-11`} />
        <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-content-tertiary" aria-label={show ? "Hide passwords" : "Show passwords"}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      </div>
      <input type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className={field} />
      <button type="button" onClick={submit} disabled={busy || !next || (hasPassword === true && !cur)} className="h-11 rounded-xl border border-primary text-primary font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : hasPassword === false ? "Set password" : "Update password"}
      </button>
    </section>
  );
}

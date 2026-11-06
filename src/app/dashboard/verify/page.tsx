"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Camera, X, Check, ShieldCheck, Clock, AlertTriangle, RotateCcw, Lock, IdCard, Sun, UserRound } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { AppBar } from "@/components/layout/AppChrome";
import { VerifiedTick } from "@/components/VerifiedTick";
import { uploadImages } from "@/lib/upload-client";
import { loginUrl } from "@/lib/auth-intent";
import { PushNudge } from "@/components/push/PushNudge";
import { askForPush } from "@/lib/push-client";
import { formatCnic, cnicDigits } from "@/lib/cnic";

/**
 * Seller verification: the CNIC (number, name on it, front and back photos)
 * → the admin checks it → the verified seller badge. No phone number here:
 * the seller already gives it on every ad. Photos go to the CDN as private
 * files (only the seller and admins can open them).
 */

type Status = "unverified" | "pending" | "verified" | "rejected";
type Info = { status: Status; cnicNumber: string; fullName: string; name: string; frontImage: string; backImage: string; rejectionReason: string | null; submittedAt: string | null };

export default function VerifyPage() {
  const { status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState(false);

  const [cnic, setCnic] = useState("");
  const [fullName, setFullName] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (status === "unauthenticated") router.push(loginUrl("/dashboard/verify"));
  }, [status, router]);

  const load = () => {
    setLoadError(false);
    fetch("/api/seller/verify").then((r) => r.json()).then((j) => {
      if (!j.success) throw new Error();
      const d = j.data as Info;
      setInfo(d);
      setCnic(formatCnic(d.cnicNumber || ""));
      setFullName(d.fullName || d.name || "");
      // Resubmitting after a rejection starts from fresh photos.
      if (d.status !== "rejected") { setFront(d.frontImage || ""); setBack(d.backImage || ""); }
    }).catch(() => setLoadError(true));
  };
  useEffect(() => { if (status === "authenticated") load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const cnicOk = cnicDigits(cnic).length === 13;
  const missing = [!cnicOk && "CNIC number", !fullName.trim() && "name on the CNIC", !front && "CNIC front", !back && "CNIC back"].filter(Boolean) as string[];

  const submit = async () => {
    if (submitting) return;
    if (missing.length) { toast.error(`Please add your ${missing.join(", ")}`); return; }
    setSubmitting(true);
    setErrors({});
    try {
      const r = await fetch("/api/seller/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cnicNumber: cnic, fullName, frontImage: front, backImage: back }),
      });
      const j = await r.json().catch(() => null);
      if (j?.success) {
        toast.success("Sent for review");
        setInfo((i) => i && { ...i, status: "pending", frontImage: front, backImage: back, submittedAt: new Date().toISOString() });
        window.scrollTo({ top: 0, behavior: "smooth" });
        askForPush("verify");
      } else {
        if (j?.field) setErrors({ [j.field]: j.message });
        toast.error(j?.message || "Couldn't send — please try again");
      }
    } catch { toast.error("We couldn't reach the server — check your connection and try again"); }
    finally { setSubmitting(false); }
  };

  if (status === "loading" || (!info && !loadError)) {
    return <div className="grid place-items-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <>
      <AppBar title="Seller verification" backHref="/dashboard" />
      <div className="max-w-lg w-full mx-auto px-4 py-5 pb-12">
        {loadError ? (
          <div className="rounded-2xl bg-card shadow-sm ring-1 ring-black/[0.03] p-8 text-center">
            <p className="text-sm text-content-secondary">Couldn't load your verification status.</p>
            <button onClick={load} className="mt-3 rounded-lg bg-primary text-white font-semibold text-sm px-5 py-2.5">Try again</button>
          </div>
        ) : info!.status === "verified" ? (
          <State tone="green" icon={<VerifiedTick size={52} />} title="You're a verified seller"
            desc="The verified badge shows on your profile and on every ad you post. Buyers trust verified sellers more." />
        ) : info!.status === "pending" ? (
          <>
            <State tone="amber" icon={<Clock className="h-12 w-12 text-amber-500" />} title="Under review"
              desc="Our team is checking your CNIC. You'll get a notification and an email as soon as it's done — usually within 24 hours." />
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Sent label="CNIC front" src={info!.frontImage} />
              <Sent label="CNIC back" src={info!.backImage} />
            </div>
            <PushNudge context="verify" className="mt-4" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheck className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-content">Verify as a seller</h1>
            </div>
            <p className="text-sm text-content-secondary">
              Verified sellers get the <span className="inline-flex align-middle"><VerifiedTick size={14} /></span> badge on every ad. It takes a minute — all you need is your CNIC. Buyers reach you on the number you put on your ads.
            </p>

            {info!.status === "rejected" && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span><b>Last time we couldn&apos;t approve it:</b> {info!.rejectionReason || "the photos weren't clear."} Please upload new photos.</span>
              </div>
            )}

            {/* 1. CNIC details */}
            <section className="mt-5">
              <StepTitle n={1} icon={UserRound} title="Your CNIC details" done={cnicOk && !!fullName.trim() && !errors.cnicNumber && !errors.fullName} />
              <label htmlFor="cnic-no" className="text-[14px] font-semibold text-content">CNIC number</label>
              <input
                id="cnic-no" inputMode="numeric" autoComplete="off" value={cnic} maxLength={15}
                onChange={(e) => { setCnic(formatCnic(e.target.value)); setErrors((x) => ({ ...x, cnicNumber: "" })); }}
                placeholder="35202-1234567-1" aria-invalid={!!errors.cnicNumber}
                className={`w-full h-12 mt-1 rounded-xl border px-3.5 text-[15px] tracking-wide tabular-nums outline-none bg-surface ${errors.cnicNumber ? "border-danger" : "border-card-border focus:border-primary"}`}
              />
              {errors.cnicNumber ? <p className="mt-1 text-[13px] text-danger">{errors.cnicNumber}</p>
                : <p className="mt-1 text-[12px] text-content-tertiary">The 13 digits on the front of the card. One CNIC can verify one account.</p>}
              <label htmlFor="cnic-name" className="block mt-3 text-[14px] font-semibold text-content">Name as written on the CNIC</label>
              <input id="cnic-name" value={fullName} onChange={(e) => { setFullName(e.target.value); setErrors((x) => ({ ...x, fullName: "" })); }} maxLength={80} autoComplete="name" placeholder="Full name"
                aria-invalid={!!errors.fullName}
                className={`w-full h-11 mt-1 rounded-xl border px-3.5 text-sm outline-none bg-surface ${errors.fullName ? "border-danger" : "border-card-border focus:border-primary"}`} />
              {errors.fullName && <p className="mt-1 text-[13px] text-danger">{errors.fullName}</p>}
            </section>

            {/* 2 + 3. CNIC photos */}
            <section className="mt-6">
              <StepTitle n={2} icon={IdCard} title="Photos of your CNIC" done={!!front && !!back} />
              <div className="grid grid-cols-2 gap-2.5">
                <UploadBox label="Front side" value={front} onChange={(v) => { setFront(v); setErrors((x) => ({ ...x, frontImage: "" })); }} error={errors.frontImage} />
                <UploadBox label="Back side" value={back} onChange={(v) => { setBack(v); setErrors((x) => ({ ...x, backImage: "" })); }} error={errors.backImage} />
              </div>
              <ul className="mt-3 grid gap-1.5 text-[13px] text-content-secondary">
                <li className="flex items-center gap-2"><Sun className="h-3.5 w-3.5 text-amber-500 shrink-0" /> Good light, no glare or flash reflection</li>
                <li className="flex items-center gap-2"><IdCard className="h-3.5 w-3.5 text-primary shrink-0" /> The whole card in the frame, all text readable</li>
                <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> The original card — not a photocopy or screenshot</li>
              </ul>
            </section>


            <button onClick={submit} disabled={submitting} className="w-full h-12 mt-6 rounded-xl bg-primary hover:bg-primary-dark text-white font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><ShieldCheck className="h-5 w-5" /> Send for verification</>}
            </button>
            {missing.length > 0 && <p className="text-[13px] text-content-tertiary text-center mt-2">Still needed: {missing.join(", ")}</p>}
            <p className="flex items-start justify-center gap-1.5 text-[12px] text-content-tertiary text-center mt-3">
              <Lock className="h-3.5 w-3.5 shrink-0 mt-px" />
              Your CNIC is stored privately — only our verification team can see it. It&apos;s never shown on your ads or profile.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function StepTitle({ n, icon: Icon, title, done }: { n: number; icon: React.ElementType; title: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className={`grid place-items-center h-6 w-6 rounded-full text-[12px] font-bold ${done ? "bg-emerald-600 text-white" : "bg-primary/10 text-primary"}`}>
        {done ? <Check className="h-3.5 w-3.5" /> : n}
      </span>
      <Icon className="h-4 w-4 text-content-tertiary" />
      <h2 className="text-sm font-bold text-content">{title}</h2>
    </div>
  );
}

function State({ icon, title, desc, tone }: { icon: React.ReactNode; title: string; desc: string; tone: "green" | "amber" }) {
  return (
    <div className={`rounded-2xl border p-7 text-center flex flex-col items-center gap-3 ${tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      {icon}
      <h1 className="text-xl font-bold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-600 max-w-xs">{desc}</p>
      <Link href="/dashboard/seller" className="mt-1 rounded-lg bg-primary text-white font-semibold text-sm px-5 py-2.5">Go to my ads</Link>
    </div>
  );
}

function Sent({ label, src }: { label: string; src: string }) {
  return (
    <div className="rounded-xl bg-card shadow-sm ring-1 ring-black/[0.03] overflow-hidden">
      <div className="aspect-[3/2] bg-surface-secondary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {src ? <img src={src} alt={label} className="h-full w-full object-cover" /> : null}
      </div>
      <p className="px-2.5 py-1.5 text-[12px] font-semibold text-content-secondary flex items-center gap-1"><Check className="h-3 w-3 text-emerald-600" /> {label} sent</p>
    </div>
  );
}

/**
 * One CNIC side. Instant local preview, real upload progress, and a failed
 * upload keeps the picture so "Try again" doesn't mean choosing it again.
 */
function UploadBox({ label, value, onChange, error }: { label: string; value: string; onChange: (url: string) => void; error?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState("");

  useEffect(() => () => { if (preview.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  const upload = async (f: File) => {
    setFailed(""); setProgress(0); onChange("");
    try {
      const { items, failed: why } = await uploadImages([f], { folder: "verification", context: `CNIC ${label.toLowerCase()}`, onProgress: (p) => setProgress(p) });
      const it = items[0];
      if (!it?.url) throw new Error(why[0]?.replace(/^[^:]*:\s*/, "") || "Upload failed");
      if (it.width && Math.max(it.width, it.height || 0) < 500) throw new Error("This photo is too small to read — take it closer");
      onChange(it.url);
    } catch (e: any) {
      setFailed(e?.message || "Upload failed — tap to try again");
    } finally { setProgress(null); }
  };

  const pick = (f?: File) => {
    if (!f) return;
    if (!/^image\//.test(f.type) && !/\.(heic|heif)$/i.test(f.name)) { setFailed("Please choose a photo (JPG, PNG or HEIC)"); return; }
    if (f.size > 20 * 1024 * 1024) { setFailed("That photo is over 20 MB — please take a new one"); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    upload(f);
  };

  const shown = preview || value;
  const busy = progress !== null;
  return (
    <div>
      <button
        type="button"
        onClick={() => (failed && file ? upload(file) : ref.current?.click())}
        disabled={busy}
        className={`relative w-full aspect-[3/2] rounded-xl border-2 border-dashed overflow-hidden bg-surface-secondary grid place-items-center transition-colors ${error || failed ? "border-danger" : value ? "border-emerald-500 border-solid" : "border-card-border hover:border-primary"}`}
        aria-label={value ? `${label} added — tap to change` : `Add ${label.toLowerCase()} photo`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {shown && <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" />}
        {!shown && (
          <span className="flex flex-col items-center gap-1.5 text-content-tertiary">
            <Camera className="h-6 w-6" />
            <span className="text-xs font-semibold">{label}</span>
            <span className="text-[11px]">Take or choose a photo</span>
          </span>
        )}
        {busy && (
          <span className="absolute inset-0 bg-black/45 grid place-items-center">
            <span className="w-3/4">
              <span className="block h-1.5 rounded-full bg-white/30 overflow-hidden"><span className="block h-full bg-white transition-all" style={{ width: `${Math.round((progress || 0) * 100)}%` }} /></span>
              <span className="mt-1.5 block text-center text-[12px] font-semibold text-white">Uploading… {Math.round((progress || 0) * 100)}%</span>
            </span>
          </span>
        )}
        {failed && !busy && (
          <span className="absolute inset-0 bg-black/55 grid place-items-center text-white text-[12px] font-semibold px-2 text-center">
            <span className="flex flex-col items-center gap-1"><RotateCcw className="h-5 w-5" /> Try again</span>
          </span>
        )}
        {value && !busy && (
          <span className="absolute bottom-0 inset-x-0 bg-emerald-600 text-white text-[11px] font-bold py-1 flex items-center justify-center gap-1"><Check className="h-3 w-3" /> {label}</span>
        )}
      </button>
      <div className="mt-1 flex items-center justify-between gap-2 min-h-[18px]">
        {(failed || error) ? <p className="text-[12px] text-danger leading-snug">{failed || error}</p> : <span />}
        {(value || failed) && !busy && (
          <button type="button" onClick={() => { onChange(""); setPreview(""); setFile(null); setFailed(""); ref.current?.click(); }} className="shrink-0 text-[12px] font-semibold text-primary flex items-center gap-0.5">
            <X className="h-3 w-3" /> Change
          </button>
        )}
      </div>
      <input ref={ref} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

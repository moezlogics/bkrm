"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useToast } from "@/components/ui/Toast";
import { GoogleG } from "@/components/auth/GoogleG";
import { safeCallbackUrl, intentReason } from "@/lib/auth-intent";
import { OtpCodeForm, postJsonWithRetry } from "@/components/auth/OtpCodeForm";
import { signInWithPassword } from "@/lib/password-signin";

function SignupInner({ brand }: { brand?: React.ReactNode }) {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  // Only ever a page on this site (see safeCallbackUrl).
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const reason = intentReason(callbackUrl);
  const hasCallback = !!params.get("callbackUrl");

  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [emailStatus, setEmailStatus] = useState("sent");
  const [loading, setLoading] = useState(false);

  // Already logged in → straight on to where they were going.
  const { status } = useSession();
  useEffect(() => { if (status === "authenticated" && step === "form") window.location.replace(callbackUrl); }, [status, step, callbackUrl]);

  const register = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; // one request per tap
    setLoading(true);
    try {
      // Retried on a dropped connection — safe: a second send re-sends the same code.
      const j = await postJsonWithRetry("/api/auth/register", { name, email: email.trim().toLowerCase(), password });
      if (j.success) {
        setStep("otp");
        setEmailStatus(j.emailStatus || "sent");
        if (j.devCode) setDevCode(j.devCode);
      } else {
        toast.error(j.message);
        // Already registered → the login page, email filled in, same destination.
        if (j.code === "exists") router.push(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
      }
    } catch { toast.error("We couldn't reach the server — check your connection and try again."); } finally { setLoading(false); }
  };

  /** Code accepted → sign in and carry on. Hard navigation so every server
   *  component sees the new session and a pending intent resumes. If signing in
   *  itself fails, the account is still verified: send them to log in with the
   *  email filled in — never a scary "failed". */
  const afterVerified = async () => {
    const r = await signInWithPassword(email, password, callbackUrl);
    if (r.ok) { window.location.assign(callbackUrl); return; }
    window.location.assign(`${basePath}/login?verified=1&email=${encodeURIComponent(email.trim().toLowerCase())}&callbackUrl=${encodeURIComponent(callbackUrl)}`);
  };

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] flex items-center justify-center bg-surface-secondary px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {brand && <div className="mb-4 flex justify-center">{brand}</div>}
          <h1 className="text-xl font-bold text-content">{step === "form" ? (reason ? reason.replace(/^Log in/, "Sign up") : "Create your account") : "Verify your email"}</h1>
          <p className="text-sm text-content-secondary mt-1">{step === "form" ? (reason ? "Takes a minute — then we'll take you straight back to it." : "One account — buy, sell and chat.") : "One last step — enter the code we emailed you."}</p>
        </div>

        <div className="bg-card border border-card-border rounded-lg sm:rounded-xl p-6 shadow-xs">
          {step === "form" ? (
            <>
              <button onClick={() => signIn("google", { redirectTo: callbackUrl })} className="w-full h-12 rounded-lg border border-card-border hover:bg-surface-secondary font-semibold text-[15px] text-content flex items-center justify-center gap-3 shadow-sm"><GoogleG /> Continue with Google</button>
              <div className="flex items-center gap-3 my-5"><div className="flex-1 h-px bg-card-border" /><span className="text-xs text-content-tertiary">or sign up with email</span><div className="flex-1 h-px bg-card-border" /></div>

              <form onSubmit={register} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-content">Full name</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" autoComplete="name" className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[13px] font-semibold text-content">Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-semibold text-content">Password</label>
                    <button type="button" onClick={() => setShowPw((s) => !s)} className="text-xs font-semibold text-primary">{showPw ? "Hide" : "Show"}</button>
                  </div>
                  <input type={showPw ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete="new-password" className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface" />
                </div>
                <button type="submit" disabled={loading} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm disabled:opacity-60">{loading ? "Please wait…" : "Create account"}</button>
              </form>
              <p className="text-[11px] text-content-tertiary text-center mt-4">By creating an account you agree to our Terms and Privacy Policy.</p>
            </>
          ) : (
            <OtpCodeForm email={email.trim().toLowerCase()} devCode={devCode} initialStatus={emailStatus} onVerified={afterVerified} onChangeEmail={() => { setStep("form"); setDevCode(""); }} />
          )}
        </div>

        <p className="text-center text-sm text-content-secondary mt-5">
          Already have an account? <Link href={`/login${hasCallback ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-bold text-primary hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}

export function SignupForm({ brand }: { brand?: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><SignupInner brand={brand} /></Suspense>;
}

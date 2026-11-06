"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { GoogleG } from "@/components/auth/GoogleG";
import { safeCallbackUrl, intentReason } from "@/lib/auth-intent";
import { OtpCodeForm, postJsonWithRetry } from "@/components/auth/OtpCodeForm";
import { signInWithPassword } from "@/lib/password-signin";

/** Map NextAuth error codes to messages a person can act on. */
function errorText(code: string): string {
  switch (code) {
    case "CredentialsSignin":
      return "Wrong email or password. Please try again.";
    case "AccessDenied":
      return "This account has been blocked. Please contact support.";
    case "OAuthAccountNotLinked":
      return "This email is already registered. Log in with your password instead.";
    case "Configuration":
      return "Sign-in is temporarily unavailable. Please try again shortly.";
    default:
      return "Couldn't sign you in. Please try again.";
  }
}

function LoginInner({ brand }: { brand?: React.ReactNode }) {
  const params = useSearchParams();
  // Only ever a page on this site (see safeCallbackUrl).
  const callbackUrl = safeCallbackUrl(params.get("callbackUrl"));
  const reason = intentReason(callbackUrl);
  const hasCallback = !!params.get("callbackUrl");
  // NextAuth redirects failed sign-ins back here with ?error=...
  const urlError = params.get("error");
  const justReset = params.get("reset") === "1";
  const justVerified = params.get("verified") === "1";

  const [email, setEmail] = useState(() => params.get("email") || "");
  // Right password but the email was never confirmed → ask for the code here.
  const [needsCode, setNeedsCode] = useState(false);
  const [devCode, setDevCode] = useState("");
  const [emailStatus, setEmailStatus] = useState("sent");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() => (urlError ? errorText(urlError) : ""));

  // Already logged in (another tab, back button) → straight on to where they were going.
  const { status } = useSession();
  useEffect(() => { if (status === "authenticated") window.location.replace(callbackUrl); }, [status, callbackUrl]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      // redirectTo + check `error` (v5 says ok:true even for a wrong password);
      // a dropped request is retried once (lib/password-signin).
      const res = await signInWithPassword(email, password, callbackUrl);
      if (res.code === "email_unverified") {
        // Send (or re-send — it's the same code) the verification email.
        const j = await postJsonWithRetry("/api/auth/resend-otp", { email: email.trim().toLowerCase() }, 2).catch(() => null);
        if (j?.devCode) setDevCode(j.devCode);
        setEmailStatus(j?.emailStatus || "sent"); // a 429 "wait a minute" means a code went out moments ago
        setNeedsCode(true);
      } else if (res.code === "rate_limited") {
        setError("Too many wrong attempts. For your security, sign-in is paused for a few minutes — please try again later.");
      } else if (res.code === "admin_portal") {
        setError("This is an admin account — please sign in on the admin sign-in page (/newlogin).");
      } else if (res.error === "network") {
        setError("We couldn't reach the server. Check your internet connection and try again.");
      } else if (res.error) {
        setError(errorText(res.error));
      } else {
        // Full document load, not router.push: every server component
        // (detail page `loggedIn`, dashboards, seller numbers) must re-render
        // with the new session, and the resumed intent needs the fresh page.
        window.location.assign(callbackUrl);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-[calc(100vh-var(--header-height))] flex items-center justify-center bg-surface-secondary px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          {brand && <div className="mb-4 flex justify-center">{brand}</div>}
          <h1 className="text-xl font-bold text-content">{reason || "Log in to your account"}</h1>
          <p className="text-sm text-content-secondary mt-1">{reason ? "We'll take you straight back to it." : "Buy, sell and chat — all with one account."}</p>
        </div>

        <div className="bg-card border border-card-border rounded-lg sm:rounded-xl p-6 shadow-xs">
          {needsCode ? (
            <>
              <h2 className="text-base font-bold text-content mb-1">Confirm your email first</h2>
              <p className="text-[14px] text-content-secondary mb-4">You never finished signing up. Enter the code we emailed you and you're in.</p>
              <OtpCodeForm
                email={email.trim().toLowerCase()}
                devCode={devCode}
                initialStatus={emailStatus}
                onChangeEmail={() => { setNeedsCode(false); setDevCode(""); }}
                onVerified={async () => {
                  const r = await signInWithPassword(email, password, callbackUrl);
                  if (r.ok) window.location.assign(callbackUrl);
                  else { setNeedsCode(false); setError("Your email is verified — please log in again."); }
                }}
              />
            </>
          ) : (<>
          <button onClick={() => signIn("google", { redirectTo: callbackUrl })} className="w-full h-12 rounded-lg border border-card-border hover:bg-surface-secondary font-semibold text-[15px] text-content flex items-center justify-center gap-3 shadow-sm">
            <GoogleG /> Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-card-border" />
            <span className="text-xs text-content-tertiary">or continue with email</span>
            <div className="flex-1 h-px bg-card-border" />
          </div>

          {justVerified && !error && (
            <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[14px] font-medium text-emerald-800">
              Your email is verified — log in to continue.
            </div>
          )}
          {justReset && !error && (
            <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-[14px] font-medium text-emerald-800">
              Password updated — log in with your new password.
            </div>
          )}
          {error && (
            <div role="alert" className="mb-4 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-[14px] font-medium text-danger">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-email" className="text-[14px] font-semibold text-content">Email</label>
              <input id="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
                className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface" />
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="login-password" className="text-[14px] font-semibold text-content">Password</label>
                <button type="button" onClick={() => setShowPw((s) => !s)} className="text-xs font-semibold text-primary">{showPw ? "Hide" : "Show"}</button>
              </div>
              <input id="login-password" type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"
                className="h-11 rounded-lg border border-card-border px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 bg-surface" />
            </div>
            <button type="submit" disabled={loading} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm disabled:opacity-60">
              {loading ? "Logging in…" : "Log in"}
            </button>
            <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="text-center text-[14px] font-semibold text-primary hover:underline">Forgot your password?</Link>
          </form>
          </>)}
        </div>

        <p className="text-center text-sm text-content-secondary mt-5">
          New here? <Link href={`/signup${hasCallback ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ""}`} className="font-bold text-primary hover:underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}

export function LoginForm({ brand }: { brand?: React.ReactNode }) {
  return <Suspense fallback={<div className="min-h-[60vh]" />}><LoginInner brand={brand} /></Suspense>;
}

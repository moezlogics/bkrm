"use client";

import React, { useEffect, useRef, useState } from "react";
import { Loader2, MailCheck, MailWarning } from "lucide-react";

/**
 * POST JSON and retry when the answer never arrived or the server hiccuped
 * (network error, 5xx, a non-JSON proxy error page). A clear refusal (4xx with
 * a message) is returned as-is. Safe for the OTP check: repeating it with the
 * right code is allowed (lib/otp checkOtp).
 */
export async function postJsonWithRetry(url: string, body: unknown, tries = 3): Promise<any> {
  let lastError: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      // A hung request (slow proxy) counts as a failed try instead of waiting forever.
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
      const j = await r.json().catch(() => null);
      if (j && r.status < 500) return j;
      lastError = new Error(j?.message || `Server error ${r.status}`);
    } catch (e) { lastError = e; }
    if (i < tries - 1) await new Promise((res) => setTimeout(res, 700 * (i + 1)));
  }
  throw lastError;
}

/**
 * The 6-digit email code step (sign-up and "verify your email" at login).
 *  - submits by itself once 6 digits are typed or pasted ("123 456" works too)
 *  - one check at a time (a double tap used to send two, and the second one
 *    answered "no active code")
 *  - retries by itself if the connection drops, and says exactly what's wrong
 */
type SendState = "sending" | "sent" | "failed";

export function OtpCodeForm({
  email, onVerified, onChangeEmail, devCode, sentNote, initialStatus = "sent",
}: {
  email: string;
  /** Called once the code is accepted — sign the person in here. */
  onVerified: () => Promise<void> | void;
  onChangeEmail?: () => void;
  devCode?: string;
  sentNote?: string;
  /** What the sign-up / resend call said about the email (lib/otp issueOtp). */
  initialStatus?: SendState | string;
}) {
  const [sendState, setSendState] = useState<SendState>(initialStatus === "sending" || initialStatus === "failed" ? initialStatus : "sent");
  const [code, setCode] = useState(devCode || "");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [countdown, setCountdown] = useState(45);
  const inFlight = useRef(false);
  const lastWrong = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // The mail server was slow: keep checking until the email is out (or failed).
  useEffect(() => {
    if (sendState !== "sending") return;
    let n = 0;
    const iv = setInterval(async () => {
      n++;
      const j = await fetch("/api/auth/otp-status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) })
        .then((r) => r.json()).catch(() => null);
      if (j?.status === "sent" || j?.status === "failed") setSendState(j.status);
      if (n >= 40) { clearInterval(iv); setSendState((s) => (s === "sending" ? "sent" : s)); }
    }, 3000);
    return () => clearInterval(iv);
  }, [sendState, email]);

  // A failed send can be retried at once.
  useEffect(() => { if (sendState === "failed") setCountdown(0); }, [sendState]);

  const verify = async (value: string) => {
    if (value.length !== 6 || inFlight.current || done) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const j = await postJsonWithRetry("/api/auth/verify-email", { email, code: value });
      if (j?.success) {
        setDone(true);
        await onVerified();
        return;
      }
      lastWrong.current = value;
      setError(j?.message || "That code didn't work — please try again.");
      inputRef.current?.select();
    } catch {
      setError("We couldn't reach the server. Check your internet connection, then tap Verify again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  // Submit as soon as the 6th digit lands (but not the same wrong code again).
  useEffect(() => {
    if (code.length === 6 && code !== lastWrong.current) verify(code);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const resend = async () => {
    setError(""); setInfo("");
    try {
      const j = await postJsonWithRetry("/api/auth/resend-otp", { email }, 2);
      if (j?.success) {
        setCountdown(45);
        setSendState(j.emailStatus === "sending" ? "sending" : "sent");
        setInfo(j.devCode ? `Test code: ${j.devCode}` : "We've emailed your code again — it's the same code, so any of our emails works.");
        if (j.devCode) setCode(j.devCode);
      } else {
        if (j?.emailStatus === "failed") setSendState("failed");
        if (j?.message) setError(j.message);
      }
    } catch { setError("Couldn't resend right now — please try again in a moment."); }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); lastWrong.current = ""; verify(code); }} className="flex flex-col gap-4">
      {sendState === "failed" ? (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-[13px] text-red-800">
          <MailWarning className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <span>We couldn&apos;t send the email to <b className="break-all">{email}</b>. Check the address is right, then tap <b>Resend code</b>.</span>
        </div>
      ) : (
        <div role="status" className="flex items-start gap-2.5 rounded-lg bg-surface-secondary px-3 py-2.5 text-[13px] text-content-secondary">
          {sendState === "sending" ? <Loader2 className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5 animate-spin" /> : <MailCheck className="h-4.5 w-4.5 text-primary shrink-0 mt-0.5" />}
          <span>{sendState === "sending"
            ? <>Sending your code to <b className="text-content break-all">{email}</b>…</>
            : sentNote || <>We sent a 6-digit code to <b className="text-content break-all">{email}</b>. It can take a minute — check Spam too.</>}</span>
        </div>
      )}
      <input
        ref={inputRef}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        aria-label="6-digit code"
        aria-invalid={!!error}
        maxLength={14}
        required
        value={code}
        onChange={(e) => { setError(""); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
        placeholder="••••••"
        disabled={done}
        className={`h-14 rounded-lg border text-center text-2xl font-bold tracking-[10px] outline-none bg-surface ${error ? "border-danger" : "border-card-border focus:border-primary"}`}
      />
      {error && <p role="alert" className="-mt-2 text-[13px] font-medium text-danger">{error}</p>}
      {info && !error && <p role="status" className="-mt-2 text-[13px] text-emerald-700">{info}</p>}
      <button type="submit" disabled={busy || done || code.length < 6} className="h-11 rounded-lg bg-primary hover:bg-primary-dark text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2">
        {busy || done ? <><Loader2 className="h-4 w-4 animate-spin" /> {done ? "Signing you in…" : "Checking…"}</> : "Verify & continue"}
      </button>
      <div className="flex items-center justify-between text-xs text-content-secondary">
        {onChangeEmail ? <button type="button" onClick={onChangeEmail} className="hover:text-content">Change email</button> : <span />}
        {countdown > 0 ? <span>Resend in {countdown}s</span> : <button type="button" onClick={resend} className="font-semibold text-primary hover:underline">Resend code</button>}
      </div>
    </form>
  );
}

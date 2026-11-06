import { randomInt } from "crypto";
import OtpCode from "@/models/OtpCode";
import { sendOtpEmail, smtpErrorText } from "@/lib/email";

type Purpose = "signup" | "password_reset";

const TTL_MS = 10 * 60_000;
/** A live code with at least this long left is re-sent instead of replaced. */
const REUSE_MIN_LEFT_MS = 2 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;

const norm = (email: string) => String(email || "").toLowerCase().trim();

/** A code for this address and purpose was sent within the last minute (resend limit).
 *  A send that FAILED doesn't count — the person may try again straight away. */
export async function otpSentRecently(email: string, purpose: Purpose) {
  const since = new Date(Date.now() - 60_000);
  return !!(await OtpCode.exists({
    email: norm(email), purpose, sendStatus: { $ne: "failed" },
    $or: [{ lastSentAt: { $gte: since } }, { lastSentAt: null, createdAt: { $gte: since } }],
  }));
}

/** Whether the latest code email went out — for the "Sending… / Sent / Couldn't send" line. */
export async function otpSendStatus(email: string, purpose: Purpose): Promise<"sending" | "sent" | "failed" | "none"> {
  const otp: any = await OtpCode.findOne({ email: norm(email), purpose }).sort({ createdAt: -1 }).select("sendStatus").lean();
  return otp ? (otp.sendStatus || "sent") : "none";
}

const SEND_WAIT_MS = 8_000;

export function smtpConfigured(): boolean {
  const u = process.env.SMTP_USER, p = process.env.SMTP_PASS;
  return !!u && !!p && u !== "your-email@gmail.com" && p !== "your-app-password";
}

/**
 * Email a 6-digit code. There is only ever ONE live code per address and
 * purpose: asking again (a double tap on "Create account", "Resend code", a
 * second tab) re-sends the same code with a fresh 10 minutes. Previously every
 * send made a new code, so the code in the first email to arrive was often
 * already dead — "I typed the code and it failed, then it worked".
 *
 * Returns a devCode when SMTP is not configured (non-production only) so the
 * flow stays testable.
 */
export async function issueOtp(email: string, purpose: Purpose = "signup") {
  const em = norm(email);
  const now = Date.now();
  let otp = await OtpCode.findOne({
    email: em, purpose, verified: false,
    expiresAt: { $gt: new Date(now + REUSE_MIN_LEFT_MS) },
    attempts: { $lt: OTP_MAX_ATTEMPTS },
  }).sort({ createdAt: -1 });

  if (otp) {
    otp.expiresAt = new Date(now + TTL_MS);
    otp.lastSentAt = new Date(now);
    await otp.save();
  } else {
    await OtpCode.deleteMany({ email: em, purpose });
    otp = await OtpCode.create({
      email: em, purpose,
      code: String(randomInt(100000, 1000000)), // crypto-grade: Math.random() codes are predictable
      expiresAt: new Date(now + TTL_MS),
      lastSentAt: new Date(now),
    });
  }
  const code = otp.code;
  const id = otp._id;
  const mark = (sendStatus: "sending" | "sent" | "failed", sendError: string | null = null) =>
    OtpCode.updateOne({ _id: id }, { $set: { sendStatus, sendError } }).catch(() => {});

  if (!smtpConfigured()) {
    console.warn(`[otp] SMTP not configured — code for ${em} is ${code}`);
    await mark("failed", "Email sending isn't set up");
    return { delivered: false as const, emailStatus: "failed" as const, ...(process.env.NODE_ENV !== "production" ? { devCode: code } : {}) };
  }

  // Send, but don't hold the request hostage to a slow mail server: after a
  // few seconds answer "sending" and let it finish in the background (the
  // code screen then checks /api/auth/otp-status).
  await mark("sending");
  const sending = sendOtpEmail(em, code, purpose)
    .then(async () => { await mark("sent"); return "sent" as const; })
    .catch(async (e: any) => {
      const why = smtpErrorText(e);
      console.error(`[otp] email to ${em} failed:`, why, e?.code || "", e?.response || "");
      await mark("failed", why);
      return "failed" as const;
    });
  const emailStatus = await Promise.race([sending, new Promise<"sending">((r) => setTimeout(() => r("sending"), SEND_WAIT_MS))]);
  return { delivered: emailStatus === "sent", emailStatus };
}

export type OtpCheck =
  | { ok: true; again: boolean }
  | { ok: false; status: number; reason: "format" | "expired" | "locked" | "mismatch"; message: string };

/**
 * Check a code. Safe to call twice with the same right code (a retry after a
 * dropped connection, a double tap): the second call answers "ok" too instead
 * of "no active code". Spaces/dashes from a pasted code are ignored.
 */
export async function checkOtp(email: string, purpose: Purpose, rawCode: unknown): Promise<OtpCheck> {
  const em = norm(email);
  const code = String(rawCode ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, status: 400, reason: "format", message: "Enter the 6-digit code from the email." };

  const otp = await OtpCode.findOne({ email: em, purpose }).sort({ createdAt: -1 });
  const now = new Date();
  if (!otp || otp.expiresAt < now) {
    return { ok: false, status: 400, reason: "expired", message: "This code has expired — tap “Resend code” for a new one." };
  }
  if (otp.verified) {
    return otp.code === code
      ? { ok: true, again: true }
      : { ok: false, status: 400, reason: "mismatch", message: "That code doesn't match the one we emailed you." };
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, status: 429, reason: "locked", message: "Too many wrong tries — tap “Resend code” for a new one." };
  }
  if (otp.code !== code) {
    const after = await OtpCode.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { new: true });
    const left = Math.max(0, OTP_MAX_ATTEMPTS - (after?.attempts ?? OTP_MAX_ATTEMPTS));
    return {
      ok: false, status: 400, reason: left ? "mismatch" : "locked",
      message: left
        ? `That code doesn't match. Use the code from our latest email — ${left} ${left === 1 ? "try" : "tries"} left.`
        : "Too many wrong tries — tap “Resend code” for a new one.",
    };
  }
  await OtpCode.updateOne({ _id: otp._id }, { $set: { verified: true } });
  return { ok: true, again: false };
}

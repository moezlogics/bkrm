import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { sendEmail, smtpErrorText, siteUrl } from "@/lib/email";
import { smtpConfigured } from "@/lib/otp";

/**
 * Admin → Settings → Email.
 *  GET   how email is set up (no secrets)
 *  POST  send a test email to the signed-in admin and report exactly what the
 *        mail server said — the quickest way to see why codes aren't arriving.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || "";
  return NextResponse.json({
    success: true,
    data: {
      configured: smtpConfigured(),
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT) || 587,
      from: from.match(/<([^>]+)>/)?.[1] || from,
    },
  });
}

export async function POST() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const to = session.user?.email;
  if (!to) return NextResponse.json({ success: false, message: "Your admin account has no email address" }, { status: 400 });
  if (!smtpConfigured()) return NextResponse.json({ success: false, message: "Email isn't set up: SMTP_USER and SMTP_PASS are missing on the server." }, { status: 400 });
  const started = Date.now();
  try {
    await sendEmail(to, {
      subject: "Test email — sending works",
      preheader: "If you can read this, verification codes will arrive too.",
      heading: "Email is working ✓",
      paragraphs: [
        "This is a test from Admin → Settings → Email.",
        "Verification codes, password resets and seller-verification updates use this same connection.",
      ],
      button: { label: "Open the admin panel", url: siteUrl("/admin") },
    });
    return NextResponse.json({ success: true, message: `Sent to ${to} in ${((Date.now() - started) / 1000).toFixed(1)}s — check the inbox (and Spam).` });
  } catch (e: any) {
    console.error("[email-test]", e?.code, e?.response || e?.message);
    return NextResponse.json({ success: false, message: smtpErrorText(e), code: e?.code || null }, { status: 502 });
  }
}

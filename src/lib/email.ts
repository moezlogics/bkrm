/**
 * Email — every message the site sends goes through one branded layout built
 * from Admin → Settings: logo, site name, brand colour, tagline, contact email,
 * social links and the copyright line. Nothing about the brand is hard-coded
 * here (the old template had a fixed brand in a dark header).
 *
 * Settings are read straight from the database (short in-memory cache), not
 * through unstable_cache, so emails also work from background jobs.
 */

import nodemailer from "nodemailer";
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";

/**
 * SMTP with sane timeouts. Nodemailer's defaults wait up to 2 minutes just to
 * connect (and 10 minutes on a stalled socket), so one slow mail server held
 * the sign-up request open until the proxy gave up — no code, "couldn't reach
 * the server". If the configured port can't be reached, the other standard
 * port is tried once (587 STARTTLS ↔ 465 SSL; hosts often block one of them).
 */
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const makeTransport = (port: number) => nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port,
  secure: port === 465,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 20_000,
});
const transporter = makeTransport(SMTP_PORT);
let fallback: ReturnType<typeof makeTransport> | null = null;
const CONNECT_ERRORS = /^(ETIMEDOUT|ECONNECTION|ECONNREFUSED|ESOCKET|EHOSTUNREACH|ENETUNREACH|ECONNRESET|EDNS)$/;

async function deliver(msg: Parameters<typeof transporter.sendMail>[0]) {
  try {
    return await transporter.sendMail(msg);
  } catch (e: any) {
    if (!CONNECT_ERRORS.test(String(e?.code || "")) || ![465, 587].includes(SMTP_PORT)) throw e;
    console.warn(`[email] port ${SMTP_PORT} failed (${e.code}) — trying ${SMTP_PORT === 587 ? 465 : 587}`);
    fallback ??= makeTransport(SMTP_PORT === 587 ? 465 : 587);
    return await fallback.sendMail(msg);
  }
}

/** Plain-language reason for an SMTP failure (shown to admins, logged). */
export function smtpErrorText(e: any): string {
  const code = String(e?.code || ""), resp = String(e?.response || e?.message || "");
  if (code === "EAUTH" || /535|534|Username and Password not accepted|Application-specific password/i.test(resp)) {
    return "The mail server refused the login (SMTP_USER / SMTP_PASS). For Gmail use an App Password, not the account password.";
  }
  if (CONNECT_ERRORS.test(code)) return `Couldn't connect to the mail server ${process.env.SMTP_HOST || "smtp.gmail.com"} (${code}). The server may be blocking outgoing mail ports 587/465.`;
  if (/421|450|451|452|454|Daily user sending limit|rate/i.test(resp)) return "The mail server is limiting how many emails can be sent right now — try again later.";
  if (/550|553|sender|from address/i.test(resp)) return `The mail server rejected the sender address: ${resp.slice(0, 160)}`;
  return resp.slice(0, 200) || "Unknown email error";
}

/**
 * One plain address — letters, digits and . _ % + - before the @, a normal
 * domain after it. No lists, comments, quotes or brackets: those are what the
 * nodemailer address-parsing advisories exploit (mail delivered to a domain
 * other than the one the app checked), so they never reach it.
 */
export function isPlainEmail(v: unknown): v is string {
  return typeof v === "string" && v.length <= 254 && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(v);
}

// ─────────────────────────── brand ───────────────────────────

export type EmailBrand = {
  siteName: string;
  tagline: string;
  logo: string;      // absolute, email-safe (JPEG) URL, or "" for a text logo
  color: string;     // #rrggbb
  siteUrl: string;   // absolute, with the base path
  supportEmail: string;
  copyright: string;
  socials: { label: string; url: string }[];
};

const BRAND_KEYS = ["site_name", "site_tagline", "site_logo", "brand_color", "contact_email", "footer_copyright",
  "social_facebook", "social_instagram", "social_youtube", "social_tiktok", "social_x"];
let brandCache: { at: number; brand: EmailBrand } | null = null;

const esc = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

/** Site address for links in emails (NEXT_PUBLIC_APP_URL includes the base path). */
export function siteUrl(path = "/"): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Logos are WebP on the CDN; email clients (Outlook) need JPEG/PNG and an absolute URL. */
function emailSafeLogo(logo: string): string {
  if (!logo) return "";
  const cdn = (process.env.NEXT_PUBLIC_CDN_URL || "").replace(/\/+$/, "");
  if (cdn && logo.startsWith(`${cdn}/u/`)) return `${cdn}/t/w_320,q_85,f_jpeg/${logo.slice(cdn.length + 3)}`;
  if (/^https?:\/\//i.test(logo)) return logo;
  if (logo.startsWith("/")) {
    const origin = (process.env.NEXT_PUBLIC_APP_URL || "").match(/^https?:\/\/[^/]+/)?.[0] || "";
    return origin ? `${origin}${logo}` : "";
  }
  return "";
}

export async function getEmailBrand(): Promise<EmailBrand> {
  if (brandCache && Date.now() - brandCache.at < 60_000) return brandCache.brand;
  let s: Record<string, string> = {};
  try {
    await dbConnect();
    const rows = await Setting.find({ key: { $in: BRAND_KEYS } }).lean();
    s = Object.fromEntries((rows as any[]).map((r) => [r.key, String(r.value ?? "")]));
  } catch { /* defaults below */ }
  const siteName = s.site_name || process.env.NEXT_PUBLIC_APP_NAME || "Marketplace";
  const year = String(new Date().getFullYear());
  const brand: EmailBrand = {
    siteName,
    tagline: s.site_tagline || "",
    logo: emailSafeLogo(s.site_logo || ""),
    color: /^#[0-9a-f]{6}$/i.test(s.brand_color || "") ? s.brand_color : "#1a56db",
    siteUrl: siteUrl("/"),
    supportEmail: isPlainEmail(s.contact_email) ? s.contact_email : "",
    copyright: (s.footer_copyright || `© {year} {site_name}. All rights reserved.`).replace(/\{year\}/g, year).replace(/\{site_name\}/g, siteName),
    socials: ([["Facebook", s.social_facebook], ["Instagram", s.social_instagram], ["YouTube", s.social_youtube], ["TikTok", s.social_tiktok], ["X", s.social_x]] as [string, string][])
      .filter(([, u]) => /^https?:\/\//i.test(u || "")).map(([label, url]) => ({ label, url })),
  };
  brandCache = { at: Date.now(), brand };
  return brand;
}

// ─────────────────────────── layout ───────────────────────────

export type EmailContent = {
  subject: string;
  /** Hidden preview line shown next to the subject in the inbox. */
  preheader: string;
  heading: string;
  paragraphs: string[];          // plain text, escaped here
  code?: string;                 // big one-time code box
  button?: { label: string; url: string };
  note?: string;                 // small grey box (security tip, reason…)
};

/** Readable text on the brand colour: dark text on light brands, white on dark. */
function onColor(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return l > 0.62 ? "#111827" : "#ffffff";
}

export function renderEmail(brand: EmailBrand, c: EmailContent): { html: string; text: string } {
  const color = brand.color;
  const header = brand.logo
    ? `<img src="${esc(brand.logo)}" alt="${esc(brand.siteName)}" height="36" style="display:block;height:36px;width:auto;max-width:220px;border:0;outline:none;" />`
    : `<span style="font-size:22px;font-weight:800;letter-spacing:-0.3px;color:${color};">${esc(brand.siteName)}</span>`;
  const paras = c.paragraphs.map((p) => `<p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">${esc(p)}</p>`).join("");
  const code = c.code ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:4px 0 24px;">
        <div style="display:inline-block;border:2px solid ${color};border-radius:12px;padding:14px 28px;background:#fafafa;">
          <span style="font-size:34px;font-weight:800;letter-spacing:10px;color:#111827;font-family:'SFMono-Regular',Consolas,'Courier New',monospace;">${esc(c.code)}</span>
        </div>
      </td></tr></table>` : "";
  const button = c.button ? `
      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:4px 0 24px;"><tr>
        <td style="border-radius:10px;background:${color};">
          <a href="${esc(c.button.url)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:${onColor(color)};text-decoration:none;border-radius:10px;">${esc(c.button.label)}</a>
        </td>
      </tr></table>` : "";
  const note = c.note ? `
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td style="background:#f9fafb;border:1px solid #eef0f3;border-radius:10px;padding:14px 16px;">
          <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.55;">${esc(c.note)}</p>
        </td>
      </tr></table>` : "";
  const socials = brand.socials.length
    ? `<p style="margin:0 0 8px;font-size:12px;">${brand.socials.map((s) => `<a href="${esc(s.url)}" style="color:#6b7280;text-decoration:underline;">${esc(s.label)}</a>`).join(" &nbsp;·&nbsp; ")}</p>` : "";
  const support = brand.supportEmail
    ? `<p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Questions? <a href="mailto:${esc(brand.supportEmail)}" style="color:#6b7280;">${esc(brand.supportEmail)}</a></p>` : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f3f4f6;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
        <tr><td style="height:4px;background:${color};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:24px 32px 8px;">
          <a href="${esc(brand.siteUrl)}" style="text-decoration:none;">${header}</a>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;">
          <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:#111827;font-weight:800;">${esc(c.heading)}</h1>
          ${paras}${code}${button}${note}
        </td></tr>
        <tr><td style="padding:20px 32px 24px;border-top:1px solid #f0f1f3;background:#fcfcfd;">
          ${socials}${support}
          <p style="margin:0 0 4px;font-size:12px;color:#9ca3af;">${esc(brand.copyright)}</p>
          ${brand.tagline ? `<p style="margin:0;font-size:12px;color:#b0b5bd;">${esc(brand.tagline)}</p>` : ""}
        </td></tr>
      </table>
      <p style="margin:14px 0 0;font-size:11px;color:#9ca3af;">This is an automated message from <a href="${esc(brand.siteUrl)}" style="color:#9ca3af;">${esc(brand.siteName)}</a> — please don't reply.</p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    brand.siteName, "", c.heading, "", ...c.paragraphs,
    ...(c.code ? ["", `Your code: ${c.code}`] : []),
    ...(c.button ? ["", `${c.button.label}: ${c.button.url}`] : []),
    ...(c.note ? ["", c.note] : []),
    "", brand.copyright, ...(brand.supportEmail ? [`Questions? ${brand.supportEmail}`] : []),
  ].join("\n");
  return { html, text };
}

/** Send one branded email. Throws when SMTP rejects it. */
export async function sendEmail(to: string, c: EmailContent): Promise<void> {
  if (!isPlainEmail(to)) throw new Error("Invalid email address");
  const brand = await getEmailBrand();
  const { html, text } = renderEmail(brand, c);
  // The name people see is the site name from Settings; the address comes from
  // SMTP_FROM (its <address> part) or the SMTP login.
  const fromEnv = process.env.SMTP_FROM || "";
  const address = fromEnv.match(/<([^>]+)>/)?.[1] || (isPlainEmail(fromEnv) ? fromEnv : "") || (isPlainEmail(process.env.SMTP_USER) ? process.env.SMTP_USER! : "");
  if (!address) throw new Error("No sender address — set SMTP_FROM or use an email address as SMTP_USER");
  await deliver({ from: { name: brand.siteName, address }, to, subject: c.subject, html, text });
}

/** Best effort (never throws) — for notices that mustn't break the request that triggered them. */
export function sendEmailQuietly(to: string | null | undefined, c: EmailContent) {
  const u = process.env.SMTP_USER, p = process.env.SMTP_PASS;
  if (!to || !u || !p) return;
  sendEmail(to, c).catch((e) => console.error("[email] not sent:", e?.message));
}

// ─────────────────────────── messages ───────────────────────────

/** The 6-digit code email (sign-up and password reset). */
export async function sendOtpEmail(email: string, code: string, purpose: string): Promise<void> {
  const brand = await getEmailBrand();
  const reset = purpose === "password_reset";
  await sendEmail(email, {
    subject: `${code} is your ${brand.siteName} ${reset ? "password reset" : "verification"} code`,
    preheader: `Your code is ${code}. It expires in 10 minutes.`,
    heading: reset ? "Reset your password" : "Confirm your email",
    paragraphs: [
      reset
        ? `Use this code to set a new password for your ${brand.siteName} account.`
        : `Welcome to ${brand.siteName}! Enter this code to confirm your email address and finish creating your account.`,
      "The code expires in 10 minutes. If you asked for it more than once, it's the same code in every email.",
    ],
    code,
    note: "Never share this code with anyone — our team will never ask you for it. If you didn't request it, you can ignore this email.",
  });
}

/** Seller ID check decided by an admin → the seller. */
export function sendVerificationResultEmail(to: string | null | undefined, o: { name?: string | null; approved: boolean; reason?: string | null }) {
  const hi = o.name ? `Hi ${o.name.split(" ")[0]},` : "Hi,";
  sendEmailQuietly(to, o.approved ? {
    subject: "You're now a verified seller",
    preheader: "Your CNIC was approved — the verified badge now shows on your ads.",
    heading: "You're verified ✓",
    paragraphs: [hi, "Our team has checked your CNIC. The verified seller badge now shows on your profile and on every ad you post — buyers trust verified sellers more."],
    button: { label: "Go to my ads", url: siteUrl("/dashboard/seller") },
  } : {
    subject: "Your verification needs another look",
    preheader: "We couldn't approve your CNIC photos — here's what to fix.",
    heading: "We couldn't verify your account yet",
    paragraphs: [hi, "Our team reviewed your CNIC photos but couldn't approve them this time. Please upload them again — it only takes a minute."],
    note: o.reason ? `Reason: ${o.reason}` : "Tip: take the photos in good light, with the whole card in the frame and all text readable.",
    button: { label: "Upload again", url: siteUrl("/dashboard/verify") },
  });
}

/** A seller sent their CNIC → the admins. */
export function sendVerificationRequestEmail(to: string | null | undefined, o: { name: string; email: string; phone?: string | null }) {
  sendEmailQuietly(to, {
    subject: `New seller verification: ${o.name}`,
    preheader: `${o.name} uploaded their CNIC for review.`,
    heading: "New verification request",
    paragraphs: [`${o.name} (${o.email}${o.phone ? `, ${o.phone}` : ""}) uploaded the front and back of their CNIC and is waiting for review.`],
    button: { label: "Review now", url: siteUrl("/admin/verifications") },
  });
}

/** A plan payment decided by an admin (or a plan given by one) → the seller. */
export function sendPlanResultEmail(to: string | null | undefined, o: {
  name?: string | null; approved: boolean; planName: string; reason?: string | null; invoiceNumber?: string;
  sub?: { listingLimit: number; featuredLimit: number; endDate: Date } | null;
}) {
  const hi = o.name ? `Hi ${o.name.split(" ")[0]},` : "Hi,";
  if (o.approved && o.sub) {
    const till = new Date(o.sub.endDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
    sendEmailQuietly(to, {
      subject: `Your ${o.planName} plan is active`,
      preheader: `${o.sub.listingLimit} live ads${o.sub.featuredLimit ? ` and ${o.sub.featuredLimit} featured` : ""}, until ${till}.`,
      heading: `${o.planName} is active ✓`,
      paragraphs: [
        hi,
        `Your plan is now running. You can keep up to ${o.sub.listingLimit} ads live${o.sub.featuredLimit ? ` and feature ${o.sub.featuredLimit} of them at the top` : ""}, until ${till}.`,
        "Feature an ad from My ads with the Boost button — featured ads are shown first to buyers.",
      ],
      button: { label: "Go to my ads", url: siteUrl("/dashboard/seller") },
    });
    return;
  }
  if (o.approved) return;
  sendEmailQuietly(to, {
    subject: "We couldn't verify your payment",
    preheader: `Your payment for the ${o.planName} plan needs another look.`,
    heading: "Payment not verified",
    paragraphs: [hi, `We checked the payment you sent for the ${o.planName} plan${o.invoiceNumber ? ` (${o.invoiceNumber})` : ""} but couldn't match it. Please send the screenshot again — it takes a minute.`],
    note: o.reason ? `Reason: ${o.reason}` : "Tip: the screenshot should show the amount, the date and the transaction ID.",
    button: { label: "Send it again", url: siteUrl("/dashboard/plans") },
  });
}

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { needsSetup, setupKeyRequired } from "@/lib/setup-state";
import { runSetup, SetupError } from "@/lib/setup";

export const dynamic = "force-dynamic";
// Seeding the catalogue and demo photos takes a while on a small server.
export const maxDuration = 120;

const same = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * First-run setup. Only works while the database has no users; in production
 * it also needs SETUP_KEY from the server's .env, so nobody can claim a
 * freshly deployed site before its owner does.
 */
export async function POST(req: NextRequest) {
  try {
    if (!(await needsSetup())) {
      return NextResponse.json({ success: false, message: "This site is already set up." }, { status: 409 });
    }
    const b = await req.json().catch(() => ({}));
    if (setupKeyRequired()) {
      const key = process.env.SETUP_KEY;
      if (!key) {
        return NextResponse.json({ success: false, message: "Add SETUP_KEY to the server's .env file and restart, then enter it here." }, { status: 403 });
      }
      if (typeof b.setupKey !== "string" || !same(b.setupKey, key)) {
        return NextResponse.json({ success: false, field: "setupKey", message: "Setup key doesn't match SETUP_KEY in .env." }, { status: 401 });
      }
    }

    const siteName = String(b.siteName || "").trim();
    const adminName = String(b.adminName || "").trim();
    const adminEmail = String(b.adminEmail || "").trim().toLowerCase();
    const adminPassword = String(b.adminPassword || "");
    const contactPhone = String(b.contactPhone || "").trim();
    const bad = (field: string, message: string) => NextResponse.json({ success: false, field, message }, { status: 400 });
    if (siteName.length < 2 || siteName.length > 60) return bad("siteName", "Site name should be 2–60 characters.");
    if (adminName.length < 2 || adminName.length > 60) return bad("adminName", "Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(adminEmail) || adminEmail.length > 120) return bad("adminEmail", "Enter a valid email address.");
    if (adminPassword.length < 10) return bad("adminPassword", "Use at least 10 characters for the admin password.");
    if (contactPhone && !/^\+?[\d\s-]{10,16}$/.test(contactPhone)) return bad("contactPhone", "Enter a valid phone number, e.g. 03001234567.");

    const stats = await runSetup({ siteName, adminName, adminEmail, adminPassword, contactPhone, demo: !!b.demo });
    return NextResponse.json({ success: true, stats });
  } catch (e) {
    if (e instanceof SetupError) return NextResponse.json({ success: false, message: e.message }, { status: 409 });
    console.error("[setup] failed:", e);
    return NextResponse.json({ success: false, message: "Setup failed — check the server log, then try again." }, { status: 500 });
  }
}

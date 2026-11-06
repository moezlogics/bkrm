import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireAuth } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

/**
 * POST /api/auth/password — { currentPassword?, newPassword }
 * Change your password. Accounts created with Google have no password yet;
 * they can set one (no current password needed) to also log in by email.
 */
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;
  const { currentPassword, newPassword } = await req.json().catch(() => ({}));

  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return NextResponse.json({ success: false, message: "New password must be at least 8 characters" }, { status: 400 });
  }
  if (newPassword.length > 128) {
    return NextResponse.json({ success: false, message: "Password is too long" }, { status: 400 });
  }

  await dbConnect();
  const user = await User.findById(session.userId).select("+password");
  if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });

  if (user.password) {
    const ok = typeof currentPassword === "string" && (await bcrypt.compare(currentPassword, user.password));
    if (!ok) return NextResponse.json({ success: false, message: "Your current password is incorrect" }, { status: 400 });
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  return NextResponse.json({ success: true, message: "Password updated" });
}

/** GET — whether the account has a password yet (Google-only accounts don't). */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const user = await User.findById(session.userId).select("+password provider").lean();
  return NextResponse.json({ success: true, data: { hasPassword: !!(user as any)?.password, provider: (user as any)?.provider } });
}

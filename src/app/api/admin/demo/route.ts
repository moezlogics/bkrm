import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { removeDemo } from "@/lib/setup";
import { logAdmin } from "@/lib/admin-log";

/** DELETE /api/admin/demo — remove the sample accounts and ads added at setup. */
export async function DELETE() {
  const { session, error } = await requireAdmin();
  if (error) return error;
  const removed = await removeDemo();
  await logAdmin(session, { action: "demo.remove", targetType: "site", targetLabel: "Demo data", details: JSON.stringify(removed).slice(0, 200) });
  return NextResponse.json({ success: true, removed });
}

/**
 * Record an admin action in the activity log (models/AdminLog).
 *
 * Never throws and never blocks the action itself: a log write that fails is
 * reported to the console and the admin's change still goes through.
 */
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import AdminLog, { type IAdminLog } from "@/models/AdminLog";
import type { AuthSession } from "@/lib/auth";

export interface AdminLogEntry {
  action: string;
  targetType: IAdminLog["targetType"];
  targetId?: unknown;
  targetLabel?: string | null;
  details?: string | null;
}

async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (h.get("cf-connecting-ip") || h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim() || null;
  } catch {
    return null; // outside a request (background job)
  }
}

export async function logAdmin(session: Pick<AuthSession, "userId" | "user"> | null, e: AdminLogEntry): Promise<void> {
  try {
    await dbConnect();
    await AdminLog.create({
      adminId: session?.userId || null,
      adminName: session?.user?.name || "",
      adminEmail: session?.user?.email || "",
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId != null ? String(e.targetId) : null,
      targetLabel: e.targetLabel ? String(e.targetLabel).slice(0, 200) : null,
      details: e.details ? String(e.details).slice(0, 1000) : null,
      ip: await clientIp(),
    });
  } catch (err: any) {
    console.warn("[admin-log] not recorded:", e.action, err?.message || err);
  }
}

import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import User from "@/models/User";
import Listing from "@/models/Listing";
import UserReport from "@/models/UserReport";
import Invoice from "@/models/Invoice";

/** GET /api/admin/counts — what's waiting for an admin (sidebar badges). */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  const n = (p: Promise<number>) => p.catch(() => 0);
  const [verifications, listings, reports, invoices] = await Promise.all([
    n(User.countDocuments({ verificationStatus: "pending" }).exec()),
    n(Listing.countDocuments({ status: "review" }).exec()),
    n(UserReport.countDocuments({ status: "open" }).exec()),
    n(Invoice.countDocuments({ status: "submitted" }).exec()),
  ]);
  return NextResponse.json(
    { success: true, data: { "/admin/verifications": verifications, "/admin/listings": listings, "/admin/reports": reports, "/admin/invoices": invoices } },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

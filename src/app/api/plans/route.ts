import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Package from "@/models/Package";
import Invoice from "@/models/Invoice";
import Setting from "@/models/Setting";
import { getServerSession } from "@/lib/auth";
import { getEntitlements, getPaymentMethods } from "@/lib/plan";

/**
 * GET /api/plans — the paid plans, and for a signed-in seller everything the
 * Plans page needs in one call: their plan and usage, the invoice still open
 * (unpaid, being checked or not verified), whether payment accounts are set
 * up, and the support number for paying by WhatsApp when they aren't.
 */
export async function GET() {
  await dbConnect();
  const session = await getServerSession();
  const plans = await Package.find({ status: true, type: "paid" }).sort({ sortOrder: 1, finalPrice: 1 }).lean();
  const data = plans.map((p: any) => ({
    _id: p._id.toString(),
    name: p.name,
    price: p.price,
    finalPrice: p.finalPrice,
    durationDays: p.durationDays,
    listingLimit: p.listingLimit,
    featuredLimit: p.featuredLimit,
    featuredDurationDays: p.featuredDurationDays,
    description: p.description,
    features: p.features || [],
    isPopular: !!p.isPopular,
  }));
  if (!session?.userId) return NextResponse.json({ success: true, data });

  const [ent, open, methods, contact] = await Promise.all([
    getEntitlements(session.userId),
    Invoice.findOne({ userId: session.userId, status: { $in: ["submitted", "awaiting_payment", "rejected"] } })
      .sort({ status: -1, createdAt: -1 })
      .select("invoiceNumber planName packageId amount status rejectionReason createdAt submittedAt").lean() as Promise<any>,
    getPaymentMethods(),
    Setting.find({ key: { $in: ["whatsapp_number", "contact_phone"] } }).lean(),
  ]);
  const byKey = new Map((contact as any[]).map((s) => [s.key, String(s.value || "")]));
  return NextResponse.json({
    success: true,
    data,
    me: {
      plan: {
        isFree: ent.isFree, planName: ent.planName, listingLimit: ent.listingLimit, listingsUsed: ent.listingsUsed,
        featuredLimit: ent.featuredLimit, featuredUsed: ent.featuredUsed, endDate: ent.endDate,
      },
      open: open ? { ...open, _id: String(open._id), packageId: String(open.packageId) } : null,
      hasPaymentMethods: methods.length > 0,
      support: byKey.get("whatsapp_number") || byKey.get("contact_phone") || "",
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

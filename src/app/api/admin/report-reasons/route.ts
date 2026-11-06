import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import { requireAdmin } from "@/lib/auth";
import ReportReason from "@/models/ReportReason";

/**
 * GET /api/admin/report-reasons
 *
 * Returns all predefined report reasons (newest first).
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    await dbConnect();

    const reasons = await ReportReason.find().sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, data: reasons });
  } catch (error: any) {
    console.error("GET Report Reasons Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to fetch reasons" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/report-reasons
 *
 * Body: { reason }. Creates a new predefined report reason.
 */
export async function POST(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const reason = (body?.reason || "").toString().trim();

    if (!reason) {
      return NextResponse.json(
        { success: false, message: "Reason text is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const exists = await ReportReason.findOne({
      reason: new RegExp(`^${reason.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
    });
    if (exists) {
      return NextResponse.json(
        { success: false, message: "This reason already exists" },
        { status: 400 }
      );
    }

    const created = await ReportReason.create({ reason });

    return NextResponse.json({
      success: true,
      message: "Reason added successfully",
      data: created,
    });
  } catch (error: any) {
    console.error("POST Report Reason Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to create reason" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/report-reasons
 *
 * Body: { reasonId }. Removes a predefined report reason.
 */
export async function DELETE(req: NextRequest) {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    const body = await req.json().catch(() => ({}));
    const reasonId = (body?.reasonId || "").toString();

    if (!reasonId) {
      return NextResponse.json(
        { success: false, message: "reasonId is required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const deleted = await ReportReason.findByIdAndDelete(reasonId);
    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "Reason not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reason deleted successfully",
    });
  } catch (error: any) {
    console.error("DELETE Report Reason Error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Failed to delete reason" },
      { status: 500 }
    );
  }
}

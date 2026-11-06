import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { BOOKINGS_ON } from "@/lib/bookings/enabled";
import { updateBooking, BookingError, type BookingAction } from "@/lib/bookings/server";

const ACTIONS = new Set<BookingAction>(["confirm", "decline", "cancel", "complete"]);
const DONE: Record<BookingAction, string> = {
  confirm: "Booking confirmed — the customer has been told.",
  decline: "Booking declined — the customer has been told.",
  cancel: "Booking cancelled — the other side has been told.",
  complete: "Marked as done.",
};

/** PATCH /api/bookings/[id] { action: confirm|decline|cancel|complete, text? } */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!BOOKINGS_ON) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
  const { session, error } = await requireAuth();
  if (error) return error;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "") as BookingAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 });
  try {
    const b = await updateBooking(id, { userId: session.userId, role: session.role }, action, body?.text);
    return NextResponse.json({ success: true, message: DONE[action], data: { status: b.status } });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ success: false, message: e.message }, { status: e.status });
    console.error("[bookings] update failed:", e);
    return NextResponse.json({ success: false, message: "Something went wrong — please try again" }, { status: 500 });
  }
}

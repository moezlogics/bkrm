import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Media from "@/models/Media";
import { requireAuth } from "@/lib/auth";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { onVerificationRequest } from "@/lib/push/events";
import { sendVerificationRequestEmail } from "@/lib/email";
import { normalizeCnic, maskCnic } from "@/lib/cnic";

/**
 * Seller verification: the CNIC — its number, the name on it, front + back.
 * No phone number: sellers give it on every ad, so asking again here only
 * got in the way.
 *
 *  GET   the signed-in person's status (+ what they sent, for the form)
 *  POST  { cnicNumber, fullName, frontImage, backImage } → pending review
 *
 * One CNIC verifies one account: a number already pending or approved on
 * another account is refused (a common way to pass a banned seller's
 * badge to a new account).
 *
 * The photos are private uploads (folder "verification") on the CDN; only the
 * uploader and admins can open them (/media/p/<id> → short-lived signed link).
 * A photo is accepted only if it is this person's own verification upload.
 * The badge appears only after an admin approves (admin/verifications).
 */

export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;
  await dbConnect();
  const u: any = await User.findById(session.userId).select("verificationStatus verificationLevel verificationDoc name isSeller").lean();
  if (!u) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
  const approved = (u.verificationLevel || 0) >= 2 || u.verificationStatus === "verified";
  return NextResponse.json({
    success: true,
    data: {
      status: approved ? "verified" : u.verificationStatus || "unverified",
      level: u.verificationLevel || 0,
      name: u.name || "",
      cnicNumber: u.verificationDoc?.cnicNumber || "",
      isSeller: !!u.isSeller,
      docType: u.verificationDoc?.docType || null,
      fullName: u.verificationDoc?.fullName || "",
      frontImage: u.verificationDoc?.frontImage || "",
      backImage: u.verificationDoc?.backImage || "",
      rejectionReason: u.verificationDoc?.rejectionReason || null,
      submittedAt: u.verificationDoc?.submittedAt || null,
    },
  });
}

const bad = (message: string, field?: string, status = 400) => NextResponse.json({ success: false, message, field }, { status });

/** The Media doc behind a private verification URL, if it's this person's upload. */
async function ownUpload(url: unknown, userId: string) {
  const u = String(url || "");
  const id = u.match(/\/media\/p\/([a-f0-9]{24})(?:$|[?#])/)?.[1];
  const q: Record<string, unknown> = { uploadedBy: new mongoose.Types.ObjectId(userId), folder: "verification", kind: "image" };
  const m: any = id ? await Media.findOne({ _id: id, ...q }).select("width height").lean() : await Media.findOne({ url: u, ...q }).select("width height").lean();
  return m;
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const cnic = normalizeCnic(body.cnicNumber);
  if (!cnic) return bad(String(body.cnicNumber || "").trim() ? "That doesn't look like a CNIC number — it has 13 digits, like 35202-1234567-1" : "Please enter your CNIC number", "cnicNumber");
  const fullName = typeof body.fullName === "string" ? body.fullName.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  if (fullName.length < 3) return bad("Please write your name exactly as it is on the CNIC", "fullName");
  if (!body.frontImage) return bad("Please add a photo of the FRONT of your CNIC", "frontImage");
  if (!body.backImage) return bad("Please add a photo of the BACK of your CNIC", "backImage");
  if (body.frontImage === body.backImage) return bad("The front and back photos are the same picture — please add the other side", "backImage");

  await dbConnect();
  const u = await User.findById(session.userId);
  if (!u) return bad("User not found", undefined, 404);
  if ((u.verificationLevel || 0) >= 2 || u.verificationStatus === "verified") return bad("Your account is already verified");
  if (u.verificationStatus === "pending") return bad("Your documents are already with our team — you'll hear back soon");

  const [front, back] = await Promise.all([ownUpload(body.frontImage, session.userId), ownUpload(body.backImage, session.userId)]);
  if (!front) return bad("The front photo didn't upload properly — please add it again", "frontImage");
  if (!back) return bad("The back photo didn't upload properly — please add it again", "backImage");
  // A tiny picture can't be read; the CDN reports the real size.
  if ((front.width && Math.max(front.width, front.height) < 500)) return bad("The front photo is too small to read — take it closer, filling the frame", "frontImage");
  if ((back.width && Math.max(back.width, back.height) < 500)) return bad("The back photo is too small to read — take it closer, filling the frame", "backImage");

  const taken = await User.exists({ _id: { $ne: u._id }, "verificationDoc.cnicNumber": cnic, verificationStatus: { $in: ["pending", "verified"] } });
  if (taken) return bad("This CNIC is already verifying another account. If that's your old account, contact us and we'll move it.", "cnicNumber");

  u.verificationStatus = "pending";
  u.verificationDoc = {
    docType: "cnic", fullName, cnicNumber: cnic,
    frontImage: String(body.frontImage), backImage: String(body.backImage), selfieImage: null,
    submittedAt: new Date(), reviewedAt: null, rejectionReason: null,
  } as any;
  await u.save();

  notifyDiscord({
    title: "New verification request",
    category: "verifications",
    description: `**${u.name}** uploaded their CNIC for review.`,
    url: "/admin/verifications",
    color: DISCORD_COLORS.verify,
    fields: [
      { name: "Seller", value: `${u.name} (${u.email})`, inline: true },
      { name: "CNIC", value: maskCnic(cnic), inline: true },
    ],
  });
  onVerificationRequest({ name: u.name || "A seller" });
  User.find({ role: "admin", isBlocked: { $ne: true } }).select("email").lean()
    .then((admins: any[]) => admins.forEach((a) => sendVerificationRequestEmail(a.email, { name: u.name || "A seller", email: u.email })))
    .catch(() => {});

  return NextResponse.json({ success: true, message: "Sent for review — we'll let you know as soon as it's checked (usually within 24 hours)." });
}

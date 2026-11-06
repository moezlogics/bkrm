import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import dbConnect from "@/lib/mongodb";
import Setting from "@/models/Setting";
import { invalidateSettings } from "@/lib/settings";
import { DEFAULT_SETTINGS } from "@/lib/settings";
import { resetDiscordConfig } from "@/lib/discord";
import { logAdmin } from "@/lib/admin-log";

/**
 * GET /api/admin/settings
 * Returns the full settings map (DB values overlaid on DEFAULT_SETTINGS).
 */
export async function GET() {
  try {
    const { error } = await requireAdmin();
    if (error) return error;

    await dbConnect();

    const docs = await Setting.find({}).lean();
    const map: Record<string, string> = { ...DEFAULT_SETTINGS };
    for (const d of docs as any[]) {
      if (d?.key) map[d.key] = d.value;
    }

    return NextResponse.json({ success: true, data: map });
  } catch (err) {
    console.error("[Admin Settings GET] error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to load settings" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/settings
 * Body: { settings: Record<string, string> }
 * Upserts each key/value pair into the Setting store.
 */
export async function PUT(req: NextRequest) {
  try {
    const { session, error } = await requireAdmin();
    if (error) return error;

    const body = await req.json();
    const settings = body?.settings;

    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return NextResponse.json(
        { success: false, message: "Invalid settings payload" },
        { status: 400 }
      );
    }

    await dbConnect();

    const entries = Object.entries(settings as Record<string, unknown>).map(([key, value]) => [key, String(value ?? "")] as const);
    const before = new Map(((await Setting.find({ key: { $in: entries.map(([k]) => k) } }).select("key value").lean()) as any[]).map((d) => [d.key, String(d.value ?? "")]));
    await Promise.all(
      entries.map(([key, value]) =>
        Setting.findOneAndUpdate(
          { key },
          { key, value },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        )
      )
    );

    invalidateSettings(); // settings are cached across requests — bust on save
    resetDiscordConfig();
    // Which settings changed — names only: some values are secrets or pasted code.
    const changed = entries.filter(([k, v]) => (before.get(k) ?? DEFAULT_SETTINGS[k] ?? "") !== v).map(([k]) => k);
    if (changed.length) {
      await logAdmin(session, { action: "settings.update", targetType: "settings", targetLabel: `${changed.length} setting${changed.length === 1 ? "" : "s"}`, details: changed.slice(0, 30).join(", ") });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Admin Settings PUT] error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to save settings" },
      { status: 500 }
    );
  }
}

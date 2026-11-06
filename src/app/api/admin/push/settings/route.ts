import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { AUTO_TYPES, PUSH_CATEGORIES, DEFAULT_PUSH_CONFIG, getPushConfig, getPushBranding, savePushConfig } from "@/lib/push/config";
import { vapidPublicKey } from "@/lib/push/send";
import { isPushWorker } from "@/lib/push/scheduler";

/**
 * GET /api/admin/push/settings — automations, templates, prompt, quiet hours,
 * icons, plus what the admin UI needs to explain them.
 * PUT { config } — save.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  const [config, brand] = await Promise.all([getPushConfig(), getPushBranding()]);
  const key = vapidPublicKey();
  return NextResponse.json({
    success: true,
    config,
    defaults: DEFAULT_PUSH_CONFIG,
    types: Object.entries(AUTO_TYPES).map(([id, d]) => ({ id, label: d.label, to: d.to, immediate: d.immediate, category: d.category, vars: d.vars })),
    categories: Object.entries(PUSH_CATEGORIES).map(([id, c]) => ({ id, ...c })),
    brand,
    system: {
      keys: !!key,
      publicKeyTail: key ? key.slice(-10) : null,
      worker: isPushWorker(),
    },
  });
}

export async function PUT(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (!b?.config || typeof b.config !== "object") return NextResponse.json({ success: false, message: "Nothing to save" }, { status: 400 });
  const c = b.config;
  // Keep numbers sane whatever the form sends.
  const n = (v: unknown, lo: number, hi: number, d: number) => {
    const x = Number(v);
    return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x))) : d;
  };
  const hhmm = (v: unknown, d: string) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
  // Each automatic notification: on/off, straight away or not, and its text.
  const auto: Record<string, unknown> = {};
  for (const k of Object.keys(AUTO_TYPES)) {
    const a = c.auto?.[k];
    if (!a || typeof a !== "object") continue;
    auto[k] = {
      enabled: !!a.enabled,
      immediate: !!a.immediate,
      title: String(a.title ?? "").slice(0, 120),
      body: String(a.body ?? "").slice(0, 300),
    };
  }
  const saved = await savePushConfig({
    ...c,
    auto,
    dailyCap: n(c.dailyCap, 1, 50, DEFAULT_PUSH_CONFIG.dailyCap),
    priceDropMinPct: n(c.priceDropMinPct, 1, 90, DEFAULT_PUSH_CONFIG.priceDropMinPct),
    milestones: String(c.milestones || DEFAULT_PUSH_CONFIG.milestones).split(",").map((s: string) => parseInt(s, 10)).filter((x: number) => x > 0).join(","),
    quiet: { ...c.quiet, start: hhmm(c.quiet?.start, "23:00"), end: hhmm(c.quiet?.end, "08:00") },
    prompt: {
      ...c.prompt,
      style: c.prompt?.style === "browser" ? "browser" : "card",
      delaySec: n(c.prompt?.delaySec, 0, 600, DEFAULT_PUSH_CONFIG.prompt.delaySec),
      minPageViews: n(c.prompt?.minPageViews, 1, 50, DEFAULT_PUSH_CONFIG.prompt.minPageViews),
      snoozeDays: n(c.prompt?.snoozeDays, 1, 365, DEFAULT_PUSH_CONFIG.prompt.snoozeDays),
    },
  });
  return NextResponse.json({ success: true, message: "Push settings saved", config: saved });
}

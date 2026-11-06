import { NextResponse } from "next/server";
import { getPushConfig, getPushBranding, renderTemplate } from "@/lib/push/config";
import { vapidPublicKey } from "@/lib/push/send";

/**
 * GET /api/push/config — what the browser needs to offer notifications:
 * the public key to subscribe with and the admin-configured prompt.
 * Same for everyone, so it's cacheable.
 */
export async function GET() {
  const loaded = await Promise.all([getPushConfig(), getPushBranding()]).catch(() => null);
  // Database briefly unavailable: just don't offer notifications on this page view.
  if (!loaded) return NextResponse.json({ enabled: false }, { headers: { "Cache-Control": "no-store" } });
  const [cfg, brand] = loaded;
  const key = vapidPublicKey();
  const site = brand.siteName;
  const t = (s: string) => renderTemplate(s, {}, site);
  return NextResponse.json(
    {
      enabled: cfg.enabled && !!key,
      publicKey: key,
      siteName: site,
      icon: brand.icon,
      prompt: {
        ...cfg.prompt,
        title: t(cfg.prompt.title),
        body: t(cfg.prompt.body),
        contexts: Object.fromEntries(Object.entries(cfg.prompt.contexts).map(([k, v]) => [k, { title: t(v.title), body: t(v.body) }])),
        excludePaths: cfg.prompt.excludePaths.split(",").map((s) => s.trim()).filter(Boolean),
      },
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}

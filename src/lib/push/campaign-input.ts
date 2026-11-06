/**
 * Validates what the admin composer sends for a campaign (shared by create
 * and edit), so a campaign in the database is always sendable.
 */
import type { Audience } from "@/models/PushCampaign";

const WHO = new Set(["all", "users", "guests", "sellers", "buyers", "specific"]);
const URGENCY = new Set(["very-low", "low", "normal", "high"]);
const str = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const strs = (v: unknown, max = 200) => (Array.isArray(v) ? v.map((x) => str(x, 80)).filter(Boolean).slice(0, max) : []);

/** Site-relative path or http(s) URL; anything else is rejected. */
export function cleanUrl(v: unknown, fallback = "/"): string | null {
  const s = str(v, 500);
  if (!s) return fallback;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function cleanAudience(a: any): Audience {
  return {
    who: WHO.has(a?.who) ? a.who : "all",
    cityIds: strs(a?.cityIds),
    areaIds: strs(a?.areaIds),
    states: strs(a?.states),
    devices: strs(a?.devices, 5),
    browsers: strs(a?.browsers, 10),
    os: strs(a?.os, 10),
    userIds: strs(a?.userIds, 500),
    activeWithinDays: Math.max(0, Math.min(365, Number(a?.activeWithinDays) || 0)),
  };
}

export function cleanCampaign(b: any): { data?: Record<string, unknown>; error?: string } {
  const title = str(b?.title, 120);
  if (!title) return { error: "Add a title" };
  const url = cleanUrl(b?.url);
  if (!url) return { error: "The link must be a page on this site (/...) or an https:// address" };
  const actions: { title: string; url: string }[] = [];
  for (const a of Array.isArray(b?.actions) ? b.actions.slice(0, 2) : []) {
    const t = str(a?.title, 24), u = cleanUrl(a?.url, "");
    if (t && u) actions.push({ title: t, url: u });
  }
  const audience = cleanAudience(b?.audience);
  if (audience.who === "specific" && !audience.userIds?.length) return { error: "Pick at least one person" };
  return {
    data: {
      name: str(b?.name, 80) || title,
      title,
      body: str(b?.body, 400),
      url,
      icon: cleanUrl(b?.icon, "") || null,
      image: cleanUrl(b?.image, "") || null,
      actions,
      requireInteraction: !!b?.requireInteraction,
      ttlHours: Math.max(1, Math.min(672, Number(b?.ttlHours) || 24)),
      urgency: URGENCY.has(b?.urgency) ? b.urgency : "normal",
      audience,
    },
  };
}

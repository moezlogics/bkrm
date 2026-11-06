/**
 * Admin-managed homepage content (sliders, feature-section rails). The same
 * for every visitor, so it's read once and shared for 30 s instead of queried
 * on every home view; admin edits clear it immediately (on the instance that
 * handled the edit — other instances catch up within the TTL).
 */
import dbConnect from "@/lib/mongodb";
import Slider from "@/models/Slider";
import { TtlLru } from "@/lib/memo";
import { loadHomepageSections } from "@/lib/feature-sections";

const store = new TtlLru<any>(4, 30_000);

export function getHomeSliders(): Promise<any[]> {
  return store.memo("sliders", async () => {
    await dbConnect();
    const rows = await Slider.find().sort({ sequence: 1, createdAt: -1 }).populate({ path: "itemId", select: "slug name" }).lean();
    return JSON.parse(JSON.stringify(rows));
  }).catch(() => []);
}

export function getHomepageSections() {
  return store.memo("sections", () => loadHomepageSections()) as ReturnType<typeof loadHomepageSections>;
}

/** The same rails, nearest-first for a visitor at a point (shared per place for 30 s). */
const local = new TtlLru<any>(400, 30_000);
export function getLocalHomepageSections(key: string, point: [number, number]) {
  return local.memo(key, () => loadHomepageSections(point)) as ReturnType<typeof loadHomepageSections>;
}

/** Call after any admin change to sliders or homepage sections. */
export function clearHomeContent() {
  store.clear();
  local.clear();
}

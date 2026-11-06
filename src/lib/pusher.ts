/**
 * Server-side Pusher singleton + helpers.
 *
 * Channels:
 *  - chat-${adId}-${buyerId}   → realtime chat messages & offer updates
 *  - seller-${userId}          → realtime seller analytics (views/favourites/offers)
 *  - admin-analytics           → realtime platform analytics for admins
 *
 * Env names: the project's .env uses PUSHER_APP_SECRET / PUSHER_CLUSTER /
 * NEXT_PUBLIC_PUSHER_APP_KEY while the code previously read PUSHER_SECRET /
 * NEXT_PUBLIC_PUSHER_{KEY,CLUSTER}. Three of the four names disagreed, so
 * realtime could never connect no matter what the operator configured. Both
 * spellings are accepted here.
 */
import Pusher from "pusher";

const APP_ID = process.env.PUSHER_APP_ID || "";
const KEY = process.env.NEXT_PUBLIC_PUSHER_APP_KEY || process.env.NEXT_PUBLIC_PUSHER_KEY || "";
const SECRET = process.env.PUSHER_APP_SECRET || process.env.PUSHER_SECRET || "";
const CLUSTER = process.env.PUSHER_CLUSTER || process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap2";

/**
 * Realtime is optional — the chat falls back to polling. Without this guard
 * every view/impression fired a doomed HTTPS request to Pusher (404), adding
 * latency to analytics writes and flooding the logs.
 */
export const pusherEnabled = Boolean(APP_ID && KEY && SECRET);

export const pusherServer = new Pusher({
  appId: APP_ID,
  key: KEY,
  secret: SECRET,
  cluster: CLUSTER,
  useTLS: true,
});

/** Fire-and-forget trigger; no-ops when Pusher isn't configured. */
export async function pusherTrigger(channel: string, event: string, payload: unknown) {
  if (!pusherEnabled) return;
  try {
    await pusherServer.trigger(channel, event, payload);
  } catch (err) {
    console.warn(`pusher trigger failed (${channel}/${event}):`, err);
  }
}

export type SellerStatEvent = {
  type: "view" | "favourite" | "offer";
  listingId?: string;
  delta?: number;
};

/**
 * Fire-and-forget realtime stat push. Never throws (Pusher may be unconfigured
 * in local/dev), so callers don't need a try/catch around it.
 */
export async function pushSellerStat(ownerId: string, event: SellerStatEvent) {
  if (!pusherEnabled) return;
  await pusherTrigger(`seller-${ownerId}`, "stat-update", event);
  await pusherTrigger("admin-analytics", "stat-update", { ...event, ownerId });
}

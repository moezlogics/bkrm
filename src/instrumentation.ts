/**
 * Runs once when a server process starts. Kicks off background work without
 * delaying startup:
 *   - any database index the models define but the database lacks (a new
 *     live database starts with none — see lib/ensure-indexes);
 *   - the heavy count aggregates, so the first visitors after a deploy or
 *     restart don't pay for computing them;
 *   - push notifications: the listing-event hook and the scheduler that sends
 *     campaigns, held pushes and reminders (lib/push/scheduler);
 *   - ad expiry and the admin's daily report (lib/jobs);
 *   - spec fields added to the vertical's catalogue since setup (lib/catalogue-sync).
 *
 * onRequestError: a page or request that fails on the server tells the admin
 * in Discord (Settings → Notifications → Server errors), each distinct error
 * at most every 30 minutes.
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  setTimeout(() => {
    import("./lib/ensure-indexes").then((m) => m.ensureIndexes()).catch((e) => console.error("[indexes] check failed:", e?.message));
    import("./lib/catalogue-sync").then((m) => m.syncNewFields()).catch((e) => console.error("[catalogue] sync failed:", e?.message));
    import("./lib/scope-counts").then((m) => m.getScopeCounts()).catch(() => { /* first request will retry */ });
    import("./lib/push/events").catch(() => {});
    import("./lib/push/scheduler").then((m) => m.startPushScheduler()).catch((e) => console.error("[push] scheduler not started:", e?.message));
    import("./lib/jobs").then((m) => m.startJobs()).catch((e) => console.error("[jobs] not started:", e?.message));
  }, 500);
}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routePath?: string; routeType?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = err as { message?: string; digest?: string; stack?: string } | null;
    const message = String(e?.message || err || "Unknown error").slice(0, 400);
    // A request the visitor aborted, or a deliberate redirect/404, is not a failure.
    if (/NEXT_REDIRECT|NEXT_NOT_FOUND|NEXT_HTTP_ERROR|aborted|ECONNRESET/i.test(message) || /^NEXT_/.test(String(e?.digest || ""))) return;
    const route = context?.routePath || request.path.split("?")[0];
    const where = String(e?.stack || "").split("\n").find((l) => /[\\/]src[\\/]/.test(l))?.trim().slice(0, 200);
    const { notifyDiscordOnce, DISCORD_COLORS } = await import("./lib/discord");
    await notifyDiscordOnce(`err:${route}|${message}`, 30, {
      title: "💥 Server error",
      description: message,
      color: DISCORD_COLORS.error,
      category: "errors",
      url: request.path.startsWith("/") ? request.path.slice(0, 300) : undefined,
      fields: [
        { name: "Route", value: `\`${request.method} ${route}\`` },
        { name: "Kind", value: String(context?.routeType || "—"), inline: true },
        ...(e?.digest ? [{ name: "Digest", value: String(e.digest), inline: true }] : []),
        ...(where ? [{ name: "Where", value: `\`${where}\`` }] : []),
      ],
    });
  } catch { /* never let reporting break anything */ }
}

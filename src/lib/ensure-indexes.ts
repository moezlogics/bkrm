/**
 * Builds any database index the models define but the database lacks.
 *
 * Production runs with MONGODB_AUTO_INDEX=0 (so a big collection is never
 * re-indexed on every boot), which left a brand-new live database with no
 * indexes at all: the map/nearby query needs the 2dsphere index on
 * listings.location and failed, so every listing page returned a 500.
 *
 * Called once per server start (instrumentation) and right after /setup.
 * When every index already exists it costs one listIndexes per collection.
 * Each missing index is created on its own, so one that clashes with an
 * index made by hand never stops the rest.
 */
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";

// Every model, so each registers its schema (and indexes) before the check.
import "@/models/AdminLog";
import "@/models/Booking";
import "@/models/Area";
import "@/models/BlockedUser";
import "@/models/BlogPost";
import "@/models/Category";
import "@/models/ChatMessage";
import "@/models/City";
import "@/models/CmsPage";
import "@/models/Country";
import "@/models/CustomField";
import "@/models/Faq";
import "@/models/Favourite";
import "@/models/FeaturedItem";
import "@/models/FeatureSection";
import "@/models/Invoice";
import "@/models/Listing";
import "@/models/LoginAttempt";
import "@/models/Media";
import "@/models/Notification";
import "@/models/Offer";
import "@/models/OtpCode";
import "@/models/Package";
import "@/models/PaymentTransaction";
import "@/models/PushCampaign";
import "@/models/PushJob";
import "@/models/PushStat";
import "@/models/PushSubscriber";
import "@/models/ReportReason";
import "@/models/Review";
import "@/models/Setting";
import "@/models/Slider";
import "@/models/State";
import "@/models/User";
import "@/models/UserNotification";
import "@/models/UserPurchasedPackage";
import "@/models/UserReport";

const g = globalThis as unknown as { __ensureIndexes?: Promise<EnsureResult> | null };

export interface EnsureResult {
  created: string[];
  failed: string[];
  ms: number;
}

async function run(): Promise<EnsureResult> {
  const t0 = Date.now();
  await dbConnect();
  const created: string[] = [];
  const failed: string[] = [];
  for (const model of Object.values(mongoose.models)) {
    let toCreate: [Record<string, unknown>, Record<string, unknown>][] = [];
    try {
      toCreate = ((await model.diffIndexes({ indexOptionsToCreate: true })).toCreate as any[]).map((x) =>
        Array.isArray(x) ? (x as [Record<string, unknown>, Record<string, unknown>]) : [x as Record<string, unknown>, {}],
      );
    } catch (e: any) {
      failed.push(`${model.modelName}: ${e?.message || e}`);
      continue;
    }
    for (const [keys, options] of toCreate) {
      try {
        await model.collection.createIndex(keys as any, options as any);
        created.push(`${model.collection.collectionName} ${JSON.stringify(keys)}`);
      } catch (e: any) {
        failed.push(`${model.collection.collectionName} ${JSON.stringify(keys)}: ${e?.message || e}`);
      }
    }
  }
  const ms = Date.now() - t0;
  if (created.length) console.log(`[indexes] created ${created.length} in ${ms} ms:\n  ${created.join("\n  ")}`);
  if (failed.length) console.warn(`[indexes] ${failed.length} could not be created:\n  ${failed.join("\n  ")}`);
  return { created, failed, ms };
}

/** Create the missing indexes. Concurrent callers in one process share one run. */
export function ensureIndexes(): Promise<EnsureResult> {
  if (!g.__ensureIndexes) {
    g.__ensureIndexes = run().finally(() => {
      g.__ensureIndexes = null;
    });
  }
  return g.__ensureIndexes;
}

/**
 * MongoDB Connection Singleton
 *
 * Ensures a single Mongoose connection is reused across hot-reloads
 * in Next.js development and across serverless function invocations.
 *
 * Uses local MongoDB by default: mongodb://127.0.0.1:27017/classifieds
 */

import mongoose from "mongoose";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/classifieds";

if (!MONGODB_URI) {
  throw new Error("Please define the MONGODB_URI environment variable");
}

/**
 * Global cache to prevent multiple connections during HMR in development.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? {
  conn: null,
  promise: null,
};

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

// Query log for profiling (DB_PROFILE=1); off otherwise.
if (process.env.DB_PROFILE === "1") {
  mongoose.set("debug", (coll: string, method: string) => console.log(`[q] ${coll}.${method}`));
}

async function dbConnect(): Promise<typeof mongoose> {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const env = process.env;
    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      // Each Node process serves many requests at once; 10 sockets made busy
      // pages queue for a connection. Size per process: (DB max connections
      // ÷ app processes), see docs/SCALING.md.
      maxPoolSize: Number(env.MONGODB_POOL_MAX || 50),
      minPoolSize: Number(env.MONGODB_POOL_MIN || 2),
      // Fail fast instead of hanging requests when the database is unreachable.
      serverSelectionTimeoutMS: Number(env.MONGODB_SELECT_TIMEOUT_MS || 5000),
      // Replica sets: e.g. "secondaryPreferred" to spread reads (listings and
      // counts tolerate a second of lag). Default: primary.
      ...(env.MONGODB_READ_PREFERENCE ? { readPreference: env.MONGODB_READ_PREFERENCE as mongoose.ConnectOptions["readPreference"] } : {}),
      // Index builds at boot are fine locally; on a big production collection
      // set MONGODB_AUTO_INDEX=0 and run scripts/reindex-keywords.mjs instead.
      autoIndex: env.MONGODB_AUTO_INDEX !== "0",
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((m) => {
      console.log("[DB] Connected to MongoDB:", MONGODB_URI);
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;

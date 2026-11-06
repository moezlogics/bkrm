/**
 * Has this site been set up? (Kept apart from lib/setup so pages can ask
 * without loading the seeding code.) Once the answer is "yes" it can never go
 * back, so it's remembered for the life of the process — one query, ever.
 */
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import Setting from "@/models/Setting";

let done = false;

/** True while the database has no users and setup hasn't run. */
export async function needsSetup(): Promise<boolean> {
  if (done) return false;
  await dbConnect();
  const [users, marker] = await Promise.all([User.estimatedDocumentCount(), Setting.exists({ key: "setup_done" })]);
  const pending = users === 0 && !marker;
  if (!pending) done = true;
  return pending;
}

/** Setup needs a key: always in production (SETUP_KEY), and locally when one is set. */
export function setupKeyRequired(): boolean {
  return !!process.env.SETUP_KEY || process.env.NODE_ENV === "production";
}

"use client";

import { signOut } from "next-auth/react";
import { detachPushUser } from "@/lib/push-client";
import { withBasePath } from "@/lib/base-path";

/**
 * Log out and land on a page of THIS app. `signOut({ callbackUrl: "/" })`
 * resolved "/" against the domain, so under a sub-URL (example.com/cars)
 * people ended up on the main site. Hard navigation: every server component
 * must re-render without the session.
 */
export async function logout(to = "/") {
  try { await detachPushUser(); } catch { /* best effort */ }
  try { await signOut({ redirect: false }); } catch { /* cookie is cleared server-side anyway */ }
  window.location.assign(withBasePath(to));
}

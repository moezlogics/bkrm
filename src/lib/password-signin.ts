"use client";

import { signIn } from "next-auth/react";

/**
 * Email + password sign-in that survives a dropped request: a network error
 * or a garbled answer is retried once. A real refusal (wrong password,
 * unverified email) comes back straight away with its `code`.
 *
 * `redirect: false` + `redirectTo` + check `error` (not `ok`) — NextAuth v5
 * reports ok:true even for rejected credentials.
 */
export async function signInWithPassword(email: string, password: string, redirectTo: string): Promise<{ ok: boolean; error?: string; code?: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res: any = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false, redirectTo });
      if (!res?.error) return { ok: true };
      return { ok: false, error: res.error, code: res.code };
    } catch {
      await new Promise((r) => setTimeout(r, 700));
    }
  }
  return { ok: false, error: "network" };
}

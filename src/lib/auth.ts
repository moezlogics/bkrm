/**
 * Auth Utility
 *
 * NextAuth v5 configuration (App Router) and helper middleware functions.
 * Provides: auth config, getServerSession, requireAuth, requireAdmin.
 */

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";

/** Right password, but the email was never confirmed — the login form then asks for the code. */
class EmailNotVerified extends CredentialsSignin {
  code = "email_unverified";
}
import bcrypt from "bcryptjs";
import dbConnect from "@/lib/mongodb";
import { BASE_PATH, withBasePath } from "@/lib/base-path";
import User from "@/models/User";
import { lockedFor, recordFailure, recordSuccess, requestIp, type Portal } from "@/lib/login-guard";
import { sendEmailQuietly, siteUrl } from "@/lib/email";
import { notifyDiscord, DISCORD_COLORS } from "@/lib/discord";
import { liveAccount } from "@/lib/account-state";

/** Too many wrong passwords from here — sign-in is paused (lib/login-guard). */
class RateLimited extends CredentialsSignin {
  code = "rate_limited";
}
/** An admin account on the public login — admins use the admin sign-in page. */
class UseAdminLogin extends CredentialsSignin {
  code = "admin_portal";
}

// Comparing against this when the email doesn't exist makes an unknown email
// take as long as a wrong password (no timing hint about who has an account).
let dummyHash: string | null = null;
const timingHash = () => (dummyHash ??= bcrypt.hashSync(`timing-${Math.random()}`, 10));

/**
 * The password check both sign-in forms share: lock check → constant-time
 * compare → count failures / clear on success. Accounts that are admins are
 * always counted under the stricter admin-portal rules.
 */
async function checkPassword(portal: Portal, credentials: Partial<Record<string, unknown>> | undefined, request?: Request) {
  const email = String(credentials?.email || "").toLowerCase().trim();
  const password = String(credentials?.password || "");
  if (!email || !password || password.length > 200) return null;
  if (credentials?.website) return null; // honeypot: a field people never see
  await dbConnect();
  const ip = requestIp(request);
  const user: any = await User.findOne({ email }).select("+password");
  // Admin accounts always get the admin rules, whichever form is used.
  const rules: Portal = user?.role === "admin" ? "admin" : portal;
  const familiar = !!user?.lastLoginIp && user.lastLoginIp === ip;
  if (await lockedFor(rules, ip, email, familiar)) throw new RateLimited();

  const passwordOk = await bcrypt.compare(password, user?.password || timingHash());
  const ok = !!user && passwordOk && !!user.password && !user.isBlocked && (portal !== "admin" || user.role === "admin");
  if (!ok) {
    const locked = await recordFailure(rules, ip, email);
    if (user?.role === "admin" && locked.length) {
      // Someone is hammering an admin account: tell its owner.
      sendEmailQuietly(user.email, {
        subject: "Admin sign-in paused after failed attempts",
        preheader: "Several wrong passwords were tried on your admin account.",
        heading: "We paused sign-in to your admin account",
        paragraphs: [
          `Several wrong passwords were just tried for ${user.email} (from IP ${ip}). Sign-in from there is paused for a while.`,
          "If this was you, wait and try again. If not, no action is needed — the password was never accepted — but consider changing it.",
        ],
        button: { label: "Open admin sign-in", url: siteUrl("/newlogin") },
      });
      notifyDiscord({ title: "Admin sign-in locked", description: `Too many failed attempts for **${user.email}**`, color: DISCORD_COLORS.security, category: "security", fields: [{ name: "IP", value: ip }] });
    }
    return null;
  }
  await recordSuccess(rules, ip, email);
  return { user, ip };
}

function sessionUser(user: any) {
  return { id: user._id.toString(), email: user.email, name: user.name, image: user.profileImage };
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  // The full path, sub-URL included (/cars/api/auth). Auth.js builds its
  // URLs from AUTH_URL's origin + this — with just "/api/auth" Google was sent
  // redirect_uri=https://example.com/api/auth/callback/google (outside the sub-path).
  // Next strips the sub-URL from requests; the route handler puts it back.
  basePath: `${BASE_PATH}/api/auth`,
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    // Used as-is in redirects — without the sub-URL they led to the main site.
    signIn: withBasePath("/login"),
    error: withBasePath("/login"),
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      /**
       * NOTE: return `null` for every auth failure — never throw a plain Error.
       * A thrown Error is classified by NextAuth v5 as a *Configuration*
       * error, which bounced the user to the error page instead of showing
       * "wrong email or password". `null` yields a proper CredentialsSignin;
       * the one exception is EmailNotVerified, a CredentialsSignin subclass
       * whose `code` reaches the login form.
       */
      async authorize(credentials, request) {
        // Unknown email, wrong password, blocked or social-only account all
        // fail the same way — we don't reveal which.
        const hit = await checkPassword("member", credentials, request);
        if (!hit) return null;
        const { user } = hit;

        // Admins sign in on the admin page (stricter limits + sign-in alerts).
        if (user.role === "admin") throw new UseAdminLogin();

        // Signed up with email + password but never entered the code: they
        // could skip verification by just logging in. Only said AFTER the
        // password matched, so it reveals nothing to someone guessing.
        // (Older accounts without the flag, and Google accounts, pass.)
        if (user.emailVerified === false && (user.provider || "credentials") === "credentials") {
          throw new EmailNotVerified();
        }
        User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastLoginIp: hit.ip } }).catch(() => {});
        return sessionUser(user);
      },
    }),
    /**
     * The admin portal (/newlogin): admin accounts only — anyone else is
     * refused like a wrong password and never gets a session. Stricter
     * limits, and every successful sign-in is emailed to the admin.
     */
    Credentials({
      id: "admin-credentials",
      name: "Admin",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        website: { label: "", type: "text" },
      },
      async authorize(credentials, request) {
        const hit = await checkPassword("admin", credentials, request);
        if (!hit) return null;
        const { user, ip } = hit;
        User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date(), lastLoginIp: ip } }).catch(() => {});
        const when = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi", dateStyle: "medium", timeStyle: "short" });
        const agent = (request?.headers.get("user-agent") || "unknown device").slice(0, 160);
        sendEmailQuietly(user.email, {
          subject: "New sign-in to the admin panel",
          preheader: `Signed in on ${when} from ${ip}.`,
          heading: "New admin sign-in",
          paragraphs: [`Your admin account (${user.email}) just signed in.`, `When: ${when} (Pakistan time)`, `IP address: ${ip}`, `Device: ${agent}`],
          note: "If this wasn't you, change your password straight away.",
        });
        notifyDiscord({ title: "Admin signed in", description: `**${user.email}**`, color: DISCORD_COLORS.approved, category: "security", fields: [{ name: "IP", value: ip }] });
        return sessionUser(user);
      },
    }),
  ],
  callbacks: {
    /**
     * Every redirect Auth.js makes stays inside this app. Its default resolved
     * "/" against the domain, which under a sub-URL is the main site.
     */
    async redirect({ url, baseUrl }) {
      const origin = new URL(baseUrl).origin;
      if (url.startsWith("/") && !url.startsWith("//")) return origin + withBasePath(url);
      try {
        const u = new URL(url);
        if (u.origin === origin) return origin + withBasePath(u.pathname) + u.search + u.hash;
      } catch { /* not a URL */ }
      return origin + withBasePath("/");
    },
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        await dbConnect();

        let existingUser = await User.findOne({ email: user.email });

        if (!existingUser) {
          existingUser = await User.create({
            name: user.name ?? undefined,
            email: user.email ?? undefined,
            emailVerified: true,
            profileImage: user.image ?? undefined,
            provider: account.provider,
            providerId: account.providerAccountId,
            onboardingCompleted: false,
          });
          notifyDiscord({ title: "🆕 New account", description: `**${existingUser.name}** — ${existingUser.email}\nSigned up with Google`, url: `/admin/users?q=${encodeURIComponent(existingUser.email)}`, color: DISCORD_COLORS.account, category: "accounts" });
        } else if (existingUser.isBlocked) {
          return false;
        }
      }

      return true;
    },

    async jwt({ token, user, trigger }) {
      if (user) {
        await dbConnect();
        const dbUser = await User.findOne({ email: user.email });
        if (dbUser) {
          token.userId = dbUser._id.toString();
          token.role = dbUser.role;
          token.onboardingCompleted = dbUser.onboardingCompleted;
          // When this sign-in happened. `iat` is renewed every time the cookie
          // is refreshed, so "sign out everywhere" needs its own timestamp.
          token.loginAt = Date.now();
        }
        return token;
      }
      if (!token.userId) return token;

      // The account as it is now: blocked, deleted or signed out everywhere
      // ends the session, and the role follows the account.
      const signedInAt = Number(token.loginAt) || (Number(token.iat) || 0) * 1000;
      const live = await liveAccount(String(token.userId), signedInAt);
      if (live === null) return null;
      if (live !== "unknown") token.role = live.role;

      // A session update (profile saved, onboarding finished) re-reads the
      // account. The values sent with it come from the browser and are never
      // trusted: copying `role` from them let any member make themselves admin.
      if (trigger === "update") {
        await dbConnect();
        const dbUser: any = await User.findById(token.userId).select("name profileImage onboardingCompleted").lean();
        if (dbUser) {
          token.name = dbUser.name;
          token.picture = dbUser.profileImage ?? null;
          token.onboardingCompleted = dbUser.onboardingCompleted;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        (session as any).userId = token.userId as string;
        (session as any).role = token.role as string;
        (session as any).onboardingCompleted =
          token.onboardingCompleted as boolean;
      }
      return session;
    },
  },
});

// ────────────────────────────────────────────
// Helper: get current session in API routes
// ────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";

export interface AuthSession {
  userId: string;
  role: string;
  onboardingCompleted: boolean;
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

import { headers } from "next/headers";
import jwt from "jsonwebtoken";

/**
 * Get the current authenticated session.
 * Supports both NextAuth session cookies and custom JWT Bearer tokens from authorization header.
 * Returns null if not authenticated.
 */
export async function getServerSession(): Promise<AuthSession | null> {
  try {
    // 1. Check Authorization header
    const headersList = await headers();
    const authHeader = headersList.get("authorization");

    // No secret configured → no Bearer logins. (It used to fall back to the
    // word "secret", which would let anyone sign an admin token.)
    const bearerSecret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (bearerSecret && authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      if (token && token !== "null" && token !== "undefined") {
        try {
          const decoded = jwt.verify(token, bearerSecret, { algorithms: ["HS256"] }) as any;

          if (decoded && decoded.userId) {
            // Same live check as cookie sessions (see the jwt callback).
            const live = await liveAccount(String(decoded.userId), (Number(decoded.iat) || 0) * 1000);
            if (live === null) return null;
            return {
              userId: decoded.userId,
              role: live === "unknown" ? decoded.role || "user" : live.role,
              onboardingCompleted: decoded.onboardingCompleted !== false,
              user: {
                id: decoded.userId,
                name: decoded.name,
                email: decoded.email,
                image: decoded.image,
              },
            };
          }
        } catch (err) {
          console.warn("JWT validation failed:", err);
        }
      }
    }

    // 2. Fallback to NextAuth cookies
    const session = await auth();
    if (session && (session.user?.id || (session as any).userId)) {
      const uId = session.user?.id || (session as any).userId;
      return {
        userId: uId,
        role: (session as any).role || "user",
        onboardingCompleted: (session as any).onboardingCompleted !== false,
        user: {
          id: uId,
          name: session.user?.name,
          email: session.user?.email,
          image: session.user?.image,
        },
      };
    }
  } catch (error) {
    console.error("Error in getServerSession:", error);
  }

  return null;
}

/**
 * Middleware: require authentication.
 * Returns the session or a 401 response.
 */
export async function requireAuth(): Promise<
  { session: AuthSession; error?: never } | { session?: never; error: NextResponse }
> {
  const session = await getServerSession();
  if (!session) {
    return {
      error: NextResponse.json(
        { success: false, message: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  return { session };
}

/**
 * Middleware: require admin role.
 * Returns the session or a 401/403 response.
 */
export async function requireAdmin(): Promise<
  { session: AuthSession; error?: never } | { session?: never; error: NextResponse }
> {
  const result = await requireAuth();
  if (result.error) return result;

  if (result.session.role !== "admin") {
    return {
      error: NextResponse.json(
        { success: false, message: "Admin access required" },
        { status: 403 }
      ),
    };
  }
  return { session: result.session };
}


import { NextRequest } from "next/server";
import { handlers } from "@/lib/auth";
import { BASE_PATH } from "@/lib/base-path";

/**
 * Under a sub-URL, Next hands this handler /api/auth/… (the base path
 * stripped), while Auth.js is configured with the full /<base-path>/api/auth
 * so the URLs it builds (Google's redirect_uri, error pages) stay on this app.
 * Put the prefix back so both agree.
 */
type Handler = (req: NextRequest) => Promise<Response>;
const withBase = (h: Handler): Handler => (req) => {
  if (!BASE_PATH) return h(req);
  const u = new URL(req.url);
  if (u.pathname === BASE_PATH || u.pathname.startsWith(`${BASE_PATH}/`)) return h(req);
  u.pathname = `${BASE_PATH}${u.pathname}`;
  return h(new NextRequest(u, req));
};

export const GET = withBase(handlers.GET as Handler);
export const POST = withBase(handlers.POST as Handler);

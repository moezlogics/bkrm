import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { getBranding } from "@/lib/branding";
import { withBasePath } from "@/lib/base-path";

/**
 * GET /brand-icon — the site's icon, wherever it's needed: the browser tab,
 * the push prompt and notifications, the installed-app icon.
 *
 * The favicon uploaded in Admin → Settings → Branding when there is one, else
 * the logo, else a generated square in the brand colour with the site's
 * initial. (The site used to ship Next.js's placeholder favicon, while push
 * pointed at the main site's /favicon.ico — two different icons, neither the
 * admin's.)
 */
export const revalidate = 300;

export async function GET(req: NextRequest) {
  const s = await getSettings().catch(() => ({} as Record<string, string>));
  const brand = getBranding(s);
  const chosen = brand.favicon || brand.logo;
  if (chosen) {
    // Uploaded files are full CDN addresses; older local ones are site paths.
    const target = /^https?:\/\//i.test(chosen) ? chosen : new URL(withBasePath(chosen), req.nextUrl.origin).toString();
    return NextResponse.redirect(target, { status: 302, headers: { "Cache-Control": "public, max-age=300" } });
  }

  const letter = (brand.logoText || "M").trim().charAt(0).toUpperCase() || "M";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: brand.primary || "#1a56db", color: "#ffffff", fontSize: 120, fontWeight: 700, borderRadius: 40,
        }}
      >
        {letter}
      </div>
    ),
    { width: 192, height: 192, headers: { "Cache-Control": "public, max-age=300" } },
  );
}

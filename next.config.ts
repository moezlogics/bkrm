import type { NextConfig } from "next";

// The site's own CDN (./cdn): originals under /u/, resized variants under /t/.
const cdn = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_CDN_URL || process.env.CDN_PUBLIC_URL || "");
    return { protocol: u.protocol.replace(":", "") as "http" | "https", hostname: u.hostname, port: u.port, local: /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname) };
  } catch { return null; }
})();

const extraHosts = (process.env.IMAGE_HOSTS || "").split(",").map((h) => h.trim()).filter(Boolean);

// Normally empty: the site runs on its own (sub)domain. Set only to serve it
// under a path such as example.com/cars.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  images: {
    // Only when the CDN itself runs on this machine (development): Next refuses
    // to optimise images from local addresses otherwise. Public CDN → stays off.
    dangerouslyAllowLocalIP: !!cdn?.local,
    remotePatterns: [
      ...(cdn ? [{ protocol: cdn.protocol, hostname: cdn.hostname, ...(cdn.port ? { port: cdn.port } : {}), pathname: "/**" }] : []),
      // Sign-in profile pictures.
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "graph.facebook.com" },
      // Any other image hosts, comma-separated: IMAGE_HOSTS=img.example.com,cdn2.example.com
      ...extraHosts.map((hostname) => ({ protocol: "https" as const, hostname, pathname: "/**" })),
    ],
    // Modern formats first — listing thumbnails are the bulk of page weight.
    formats: ["image/avif", "image/webp"],
    // Card thumbs are 96/160px; detail gallery goes full-bleed. Narrow the
    // generated set so we aren't building sizes nothing requests.
    deviceSizes: [480, 828, 1080, 1440],
    imageSizes: [96, 160, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  // Keep Mongoose and Nodemailer on server side only
  serverExternalPackages: ["mongoose", "nodemailer", "bcryptjs"],

  // Tree-shake icon/animation barrel imports so a page pulling 6 icons doesn't
  // pay for the whole library.
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion"],
    // Client router cache. Every page here is dynamic (it follows the
    // visitor's location), and Next 16 keeps visited dynamic pages for 0s by
    // default — so going back to a page you just saw hit the server again.
    //  dynamic: pages you've visited are re-shown instantly for 30s
    //  static:  pages fully prefetched (prefetch={true} / intent) stay ready
    //           for 2 min — short enough that new ads still surface quickly.
    staleTimes: { dynamic: 30, static: 120 },
    // Build workers (default: one per core). NEXT_BUILD_CPUS=2 on a build
    // machine short on memory — each worker is a separate Node process.
    ...(process.env.NEXT_BUILD_CPUS ? { cpus: Number(process.env.NEXT_BUILD_CPUS) } : {}),
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },

  // Behind Nginx (deploy/nginx.web.conf.example) set NEXT_COMPRESS=0: Nginx
  // gzips in C off the Node thread, leaving Node's CPU for rendering pages.
  compress: process.env.NEXT_COMPRESS !== "0",
  poweredByHeader: false,

  // The push service worker must never be cached, or browsers keep an old copy
  // for up to a day after a deploy.
  async headers() {
    return [
      // Admin sign-in and panel: never cached, never indexed.
      ...["/newlogin", "/admin", "/admin/:path*"].map((source) => ({
        source,
        headers: [
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      })),
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;

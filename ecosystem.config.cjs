// PM2 for the web app: `npm ci && npm run build && pm2 start ecosystem.config.cjs && pm2 save`
// Names and ports come from .env.local (APP_ID, PORT, PUSH_PORT), so the cars
// and bikes sites run side by side on one server without clashing.
require("@next/env").loadEnvConfig(__dirname);
const id = (process.env.APP_ID || "marketplace").replace(/[^a-z0-9-]/gi, "-");
const port = process.env.PORT || "3100";
const pushPort = process.env.PUSH_PORT || String(Number(port) + 50);
// One Next.js process per CPU core behind PM2's cluster balancer (Node is
// single-threaded; one process can't use a multi-core server). See docs/SCALING.md.
module.exports = {
  apps: [
    {
      name: `${id}-web`,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,
      cwd: __dirname,
      // Two processes by default: this server also runs MySQL, MongoDB, PHP-FPM,
      // Varnish, Redis and the CDN, and each Next.js process takes ~200–400 MB —
      // "max" (one per core) can push the box into swapping / the OOM killer.
      // Raise with WEB_INSTANCES=… on a server of its own.
      instances: process.env.WEB_INSTANCES || 2,
      exec_mode: "cluster",
      max_memory_restart: "1G",
      kill_timeout: 10000, // let in-flight requests finish on reload
      env: {
        NODE_ENV: "production",
        // Per process: keep (instances × MONGODB_POOL_MAX) under the database's connection limit.
        MONGODB_POOL_MAX: "30",
        // Nginx compresses responses (deploy/nginx.web.conf.example).
        NEXT_COMPRESS: "0",
        // Web processes serve pages; the push worker below sends campaigns,
        // so a send to a large audience never competes with page rendering.
        PUSH_WORKER: "0",
        // Index builds belong to deploys (scripts/reindex-keywords.mjs), not app boot.
        MONGODB_AUTO_INDEX: "0",
      },
      time: true,
    },
    {
      // Background sender: push campaigns, notifications held for quiet hours
      // and reminders. One process only, on a port nothing else talks to.
      name: `${id}-push`,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${pushPort} -H 127.0.0.1`,
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "700M",
      env: {
        NODE_ENV: "production",
        PUSH_WORKER: "1",
        MONGODB_POOL_MAX: "20",
        MONGODB_AUTO_INDEX: "0",
      },
      time: true,
    },
  ],
};

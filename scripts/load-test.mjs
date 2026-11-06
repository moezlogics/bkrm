#!/usr/bin/env node
/**
 * Quick load test for the public pages (no dependencies).
 *
 *   node scripts/load-test.mjs                          # http://localhost:3100, 40 users, 5 s/route
 *   node scripts/load-test.mjs https://example.com 100 10
 *   TOP=motorcycles BRAND=honda Q="cd 70" node scripts/load-test.mjs   # the bikes site
 *
 * Prints single-request latency (p50) and throughput under N concurrent users
 * for each route. Run it against a production build (`npm run build && npm
 * start`), never `next dev`, and ideally from another machine.
 */
const BASE = (process.argv[2] || "http://localhost:3100").replace(/\/+$/, "");
const USERS = Number(process.argv[3] || 40);
const SECS = Number(process.argv[4] || 5);
const COOKIE = "loc_city=lahore; loc_src=manual"; // a visitor browsing from Lahore
const TOP = process.env.TOP || "cars";
const BRAND = process.env.BRAND || "toyota";
const Q = process.env.Q || "corolla 2020";

const ROUTES = [
  ["home", "/"],
  ["city", "/lahore"],
  ["city + category", `/lahore/${TOP}`],
  ["national category", `/${TOP}`],
  ["brand", `/${TOP}/${BRAND}`],
  ["search", `/search?q=${encodeURIComponent(Q)}&all=1`],
  ["search suggest", `/api/search/suggest?q=${encodeURIComponent(Q.slice(0, 3))}`],
  ["location picker", "/api/cities?citySlug=lahore"],
];

async function hit(path, rsc = false) {
  const t = performance.now();
  try {
    const r = await fetch(BASE + path, { headers: { Cookie: COOKIE, ...(rsc ? { RSC: "1" } : {}) } });
    await r.arrayBuffer();
    return { ms: performance.now() - t, ok: r.ok };
  } catch {
    return { ms: performance.now() - t, ok: false };
  }
}
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };

console.log(`\n${BASE} — ${USERS} concurrent users, ${SECS}s per route\n`);
console.log(`  ${"route".padEnd(20)} ${"single".padStart(8)} ${"req/s".padStart(8)} ${"p50".padStart(8)} ${"p95".padStart(8)} ${"errors".padStart(7)}`);
for (const [name, path] of ROUTES) {
  for (let i = 0; i < 3; i++) await hit(path); // warm up
  const single = [];
  for (let i = 0; i < 5; i++) single.push((await hit(path)).ms);
  const lat = []; let errors = 0; const end = Date.now() + SECS * 1000;
  await Promise.all(Array.from({ length: USERS }, async () => {
    while (Date.now() < end) { const r = await hit(path); lat.push(r.ms); if (!r.ok) errors++; }
  }));
  const f = (n) => `${Math.round(n)}`.padStart(8);
  console.log(`  ${name.padEnd(20)} ${f(pct(single, 0.5))} ${f(lat.length / SECS)} ${f(pct(lat, 0.5))} ${f(pct(lat, 0.95))} ${String(errors).padStart(7)}`);
}
console.log("\n  single = one request at a time (ms); p50/p95 = latency under load (ms)\n");

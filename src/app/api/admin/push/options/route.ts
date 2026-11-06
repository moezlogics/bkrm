import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import PushSubscriber from "@/models/PushSubscriber";
import { requireAdmin } from "@/lib/auth";
import { getCatalog } from "@/lib/catalog";

/**
 * GET /api/admin/push/options — choices for the audience builder, with how
 * many active devices each has: cities (all of them, busiest first), states,
 * devices, browsers, operating systems.
 */
export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  await dbConnect();
  const group = (field: string) => PushSubscriber.aggregate([
    { $match: { status: "active" } },
    { $group: { _id: `$${field}`, n: { $sum: 1 } } },
  ]).option({ maxTimeMS: 15_000 });
  const [catalog, cities, states, devices, browsers, os] = await Promise.all([
    getCatalog(), group("cityId"), group("state"), group("device"), group("browser"), group("os"),
  ]);
  const byCity = new Map(cities.map((c: any) => [String(c._id), c.n]));
  const stateNames = new Set<string>(catalog.cities.map((c) => c.stateName).filter(Boolean));
  const byState = new Map(states.map((s: any) => [s._id, s.n]));
  const named = (rows: any[]) => rows.filter((r) => r._id).map((r) => ({ name: r._id, n: r.n })).sort((a, b) => b.n - a.n);
  return NextResponse.json({
    success: true,
    cities: catalog.cities
      .map((c) => ({ id: String(c._id), name: c.name, slug: c.slug, state: c.stateName || null, n: byCity.get(String(c._id)) || 0 }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    states: [...stateNames].map((name) => ({ name, n: byState.get(name) || 0 })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    devices: named(devices),
    browsers: named(browsers),
    os: named(os),
  });
}

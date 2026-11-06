/** Haversine distance in km between two lat/lng points. */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Nearest item (with numeric latitude/longitude) to a point, or null. */
export function nearest<T extends { latitude?: number | null; longitude?: number | null }>(
  items: T[], lat: number, lng: number
): { item: T; distance: number } | null {
  let best: T | null = null;
  let min = Infinity;
  for (const it of items) {
    if (it.latitude == null || it.longitude == null) continue;
    const d = haversine(lat, lng, it.latitude, it.longitude);
    if (d < min) { min = d; best = it; }
  }
  return best ? { item: best, distance: Math.round(min) } : null;
}

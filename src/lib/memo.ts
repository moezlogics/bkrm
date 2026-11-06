/**
 * Small in-process caches for hot, shared reads.
 *
 * Popular searches and archive pages repeat constantly ("iphone", "samsung
 * lahore"…); a few seconds of freshness is invisible to people but turns
 * thousands of identical DB queries per minute into one. Each Node instance
 * keeps its own copy — for many instances put Redis behind the same API
 * (docs/SCALING.md).
 *
 * `memo()` also de-duplicates concurrent misses: 500 simultaneous requests for
 * a cold key run the query once (no thundering herd).
 */
type Entry<V> = { v: V; exp: number };

export class TtlLru<V> {
  private map = new Map<string, Entry<V>>();
  private inflight = new Map<string, Promise<V>>();
  constructor(private max: number, private ttlMs: number) {}

  get(key: string): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.exp < Date.now()) { this.map.delete(key); return undefined; }
    // Refresh recency.
    this.map.delete(key);
    this.map.set(key, e);
    return e.v;
  }

  set(key: string, v: V) {
    this.map.delete(key);
    this.map.set(key, { v, exp: Date.now() + this.ttlMs });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }

  async memo(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const running = this.inflight.get(key);
    if (running) return running;
    const p = load()
      .then((v) => { this.set(key, v); return v; })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  clear() { this.map.clear(); }
}

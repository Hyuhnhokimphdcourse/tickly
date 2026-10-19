/**
 * Merge two copies of the app data (this device vs. the copy in Google Drive).
 * - Readings are immutable: union by id.
 * - Watches and cycles: the copy edited last wins (updatedAt); log entries of a cycle are unioned.
 * - Wear days: the copy whose day was edited last wins.
 * - Tombstones (deleted ids) are unioned and always applied, so deletions propagate.
 * - Settings stay device-local.
 */
import type { AppData, Cycle, PrecisionEntry } from '../types';

type Stamped = { id: string; updatedAt?: number };

function pickNewer<T extends Stamped>(a: T | undefined, b: T | undefined): T | undefined {
  if (!a) return b;
  if (!b) return a;
  return (b.updatedAt ?? 0) > (a.updatedAt ?? 0) ? b : a;
}

function byId<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  const m = new Map<string, T>();
  for (const x of list ?? []) m.set(x.id, x);
  return m;
}

export function mergeData(local: AppData, remote: AppData | null): AppData {
  if (!remote) return local;
  const tomb: Record<string, number> = { ...(remote.tombstones ?? {}) };
  for (const [k, v] of Object.entries(local.tombstones ?? {})) tomb[k] = Math.max(tomb[k] ?? 0, v);
  const dead = (id: string) => id in tomb;

  // watches
  const lw = byId(local.watches), rw = byId(remote.watches);
  const watches = [...new Set([...lw.keys(), ...rw.keys()])]
    .filter(id => !dead(id))
    .map(id => pickNewer(lw.get(id), rw.get(id))!)
    .sort((a, b) => a.order - b.order);

  // readings
  const readingsMap = byId(remote.readings);
  for (const r of local.readings ?? []) readingsMap.set(r.id, r);
  const readings = [...readingsMap.values()].filter(r => !dead(r.id) && !dead(r.watchId)).sort((a, b) => a.at - b.at);

  // cycles
  const lc = byId(local.cycles), rc = byId(remote.cycles);
  const cycles: Cycle[] = [];
  for (const id of new Set([...lc.keys(), ...rc.keys()])) {
    if (dead(id)) continue;
    const a = lc.get(id), b = rc.get(id);
    const base = pickNewer(a, b)!;
    if (dead(base.watchId)) continue;
    const entries = new Map<number, PrecisionEntry>();
    for (const e of [...(a?.entries ?? []), ...(b?.entries ?? [])]) if (!dead(`${id}:${e.t}`)) entries.set(e.t, e);
    cycles.push({ ...base, entries: [...entries.values()].sort((x, y) => x.t - y.t) });
  }
  cycles.sort((x, y) => x.startedAt - y.startedAt);

  // wear
  const wear: Record<string, string[]> = {};
  const wearAt: Record<string, number> = {};
  const days = new Set([...Object.keys(local.wear ?? {}), ...Object.keys(remote.wear ?? {}), ...Object.keys(local.wearAt ?? {}), ...Object.keys(remote.wearAt ?? {})]);
  for (const d of days) {
    const la = local.wearAt?.[d] ?? 0, ra = remote.wearAt?.[d] ?? 0;
    const src = ra > la ? remote : local;
    // a day with no edit time on either side (old data): union of both lists
    const list = (la === 0 && ra === 0
      ? [...new Set([...(local.wear?.[d] ?? []), ...(remote.wear?.[d] ?? [])])]
      : src.wear?.[d] ?? []
    ).filter(id => !dead(id));
    if (list.length) wear[d] = list;
    const at = Math.max(la, ra);
    if (at) wearAt[d] = at;
  }

  return { ...local, version: 1, watches, readings, cycles, wear, wearAt, tombstones: tomb };
}

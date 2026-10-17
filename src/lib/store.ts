import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { AppData, Cycle, Reading, Settings, Watch } from './types';
import { dayKey, newId } from './util';

const KEY = 'tickly.data.v1';

const DEFAULT_SETTINGS: Settings = {
  apiKeySet: false,
  aiModel: 'claude-sonnet-5-5',
  defaultLiftAngle: 52,
  standardSeconds: 30,
  longSeconds: 60,
};

let data: AppData = { version: 1, watches: [], readings: [], cycles: [], wear: {}, settings: DEFAULT_SETTINGS };
let loaded = false;
/** Stable snapshot object for useSyncExternalStore: replaced only when data changes. */
let snapshot = { data, loaded };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  snapshot = { data, loaded };
  listeners.forEach(l => l());
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
  }, 250);
}

function set(next: AppData) {
  data = next;
  emit();
  scheduleSave();
}

export async function loadStore() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      data = { ...data, ...parsed, settings: { ...DEFAULT_SETTINGS, ...parsed.settings } };
    }
  } catch {
    // start empty on a corrupt or missing store
  }
  loaded = true;
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whole-store snapshot. Derive lists with useMemo in the component. */
export function useStore(): { data: AppData; loaded: boolean } {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Snapshot accessor for non-React code. */
export const getData = () => data;

// ---------- watches ----------
export function saveWatch(w: Watch): Watch {
  const exists = data.watches.some(x => x.id === w.id);
  const next: Watch = exists
    ? w
    : { ...w, id: w.id || newId('w'), createdAt: Date.now(), order: data.watches.length };
  set({ ...data, watches: exists ? data.watches.map(x => (x.id === w.id ? next : x)) : [...data.watches, next] });
  return next;
}

export function patchWatch(id: string, patch: Partial<Watch>) {
  set({ ...data, watches: data.watches.map(x => (x.id === id ? { ...x, ...patch } : x)) });
}

export function deleteWatch(id: string) {
  const wear: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(data.wear)) {
    const f = v.filter(x => x !== id);
    if (f.length) wear[k] = f;
  }
  set({
    ...data,
    watches: data.watches.filter(x => x.id !== id),
    readings: data.readings.filter(r => r.watchId !== id),
    cycles: data.cycles.filter(c => c.watchId !== id),
    wear,
  });
}

export function moveWatch(id: string, dir: -1 | 1) {
  const list = data.watches.slice().sort((a, b) => a.order - b.order);
  const i = list.findIndex(w => w.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  set({ ...data, watches: list.map((w, k) => ({ ...w, order: k })) });
}

// ---------- readings ----------
export function addReading(r: Omit<Reading, 'id' | 'at'> & { at?: number }): Reading {
  const rec: Reading = { ...r, at: r.at ?? Date.now(), id: newId('r') };
  set({ ...data, readings: [...data.readings, rec] });
  return rec;
}
export function deleteReading(id: string) {
  set({ ...data, readings: data.readings.filter(r => r.id !== id) });
}

// ---------- precision cycles ----------
export function startCycle(watchId: string, note = ''): Cycle {
  const c: Cycle = { id: newId('c'), watchId, startedAt: Date.now(), endedAt: null, note, entries: [] };
  // only one open cycle per watch
  const cycles = data.cycles.map(x => (x.watchId === watchId && x.endedAt == null ? { ...x, endedAt: Date.now() } : x));
  set({ ...data, cycles: [...cycles, c] });
  return c;
}
export function patchCycle(id: string, patch: Partial<Cycle>) {
  set({ ...data, cycles: data.cycles.map(c => (c.id === id ? { ...c, ...patch } : c)) });
}
export function deleteCycle(id: string) {
  set({ ...data, cycles: data.cycles.filter(c => c.id !== id) });
}

// ---------- wear ----------
export function toggleWear(watchId: string, ms = Date.now()) {
  const k = dayKey(ms);
  const cur = data.wear[k] ?? [];
  const next = cur.includes(watchId) ? cur.filter(x => x !== watchId) : [...cur, watchId];
  const wear = { ...data.wear };
  if (next.length) wear[k] = next; else delete wear[k];
  set({ ...data, wear });
}

// ---------- settings ----------
export function patchSettings(p: Partial<Settings>) {
  set({ ...data, settings: { ...data.settings, ...p } });
}

// ---------- backup ----------
export function exportJson(): string {
  return JSON.stringify(data, null, 2);
}
export function importJson(raw: string): boolean {
  try {
    const p = JSON.parse(raw) as AppData;
    if (!Array.isArray(p.watches) || !Array.isArray(p.readings)) return false;
    set({ ...data, ...p, settings: { ...data.settings, ...p.settings } });
    return true;
  } catch {
    return false;
  }
}

/**
 * Keeps this device's data and the copy in Google Drive in step:
 * pull → merge → push, after every local edit (debounced) and on demand.
 * The device copy stays primary; Drive is the durable, cross-device copy.
 */
import { useSyncExternalStore } from 'react';

import { applySynced, getData, onLocalChange } from '../store';
import {
  AuthError, downloadJson, driveReady, driveSupported, findOrCreateDataFile, hasToken, loadDrive,
  requestToken, revokeToken, uploadJson, whoAmI,
} from './drive';
import { mergeData } from './merge';

export type SyncStatus = 'off' | 'needs-auth' | 'syncing' | 'ok' | 'error';
export interface SyncState {
  supported: boolean;
  enabled: boolean;
  status: SyncStatus;
  lastSync: number | null;
  email: string | null;
  dirty: boolean;
  message: string | null;
}

const META_KEY = 'tickly.sync.v1';
interface Meta { enabled: boolean; fileId?: string; lastSync?: number; email?: string | null }

function readMeta(): Meta {
  try { return JSON.parse(globalThis.localStorage?.getItem(META_KEY) ?? 'null') ?? { enabled: false }; } catch { return { enabled: false }; }
}
function writeMeta() {
  try { globalThis.localStorage?.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

let meta: Meta = { enabled: false };
let state: SyncState = { supported: driveSupported, enabled: false, status: 'off', lastSync: null, email: null, dirty: false, message: null };
const listeners = new Set<() => void>();
function setState(p: Partial<SyncState>) {
  state = { ...state, ...p };
  listeners.forEach(l => l());
}

let started = false;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | null = null;

export function initSync() {
  if (started || !driveSupported) return;
  started = true;
  meta = readMeta();
  setState({ enabled: meta.enabled, lastSync: meta.lastSync ?? null, email: meta.email ?? null, status: meta.enabled ? (hasToken() ? 'ok' : 'needs-auth') : 'off' });
  loadDrive(onToken);
  onLocalChange(() => {
    if (!meta.enabled) return;
    setState({ dirty: true });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2500);
  });
  if (meta.enabled && hasToken()) void syncNow();
}

function onToken(ok: boolean, err?: string) {
  if (!ok) {
    const cancelled = err === 'popup_closed' || err === 'access_denied';
    setState({ status: meta.enabled ? 'needs-auth' : 'off', message: cancelled ? '연결을 취소했습니다.' : `Google 연결에 실패했습니다 (${err}). 팝업 차단을 확인하세요.` });
    return;
  }
  const first = !meta.enabled;
  meta.enabled = true;
  writeMeta();
  setState({ enabled: true, message: null });
  void syncNow().then(async () => {
    if (first || !meta.email) {
      meta.email = await whoAmI();
      writeMeta();
      setState({ email: meta.email ?? null });
    }
  });
}

/** Tap handler: opens Google's sign-in/consent popup. */
export function connectDrive() {
  if (!driveReady()) {
    setState({ message: 'Google 연결을 준비하는 중입니다. 잠시 후 다시 눌러 주세요.' });
    return;
  }
  requestToken(!meta.enabled);
}

export function disconnectDrive() {
  revokeToken();
  meta = { enabled: false };
  writeMeta();
  setState({ enabled: false, status: 'off', email: null, lastSync: null, dirty: false, message: '연결을 해제했습니다. 드라이브의 파일은 그대로 남아 있습니다.' });
}

export async function syncNow(): Promise<void> {
  if (!meta.enabled) return;
  if (!hasToken()) { setState({ status: 'needs-auth' }); return; }
  if (running) { again = true; return; }
  running = true;
  setState({ status: 'syncing', message: null });
  try {
    if (!meta.fileId) { meta.fileId = await findOrCreateDataFile(); writeMeta(); }
    let remote;
    try {
      remote = await downloadJson(meta.fileId);
    } catch (e) {
      if ((e as { status?: number }).status === 404) {
        meta.fileId = await findOrCreateDataFile();
        writeMeta();
        remote = await downloadJson(meta.fileId);
      } else throw e;
    }
    const merged = mergeData(getData(), remote);
    applySynced(merged);
    await uploadJson(meta.fileId, merged);
    meta.lastSync = Date.now();
    writeMeta();
    setState({ status: 'ok', lastSync: meta.lastSync, dirty: false });
  } catch (e) {
    if (e instanceof AuthError) setState({ status: 'needs-auth' });
    else setState({ status: 'error', message: `동기화 실패: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    running = false;
    if (again) { again = false; void syncNow(); }
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
export function useSync(): SyncState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
